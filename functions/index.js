// functions/index.js (Phiên bản cuối cùng, đầy đủ chức năng)

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();
const auth = getAuth();

/**
 * Hàm 1: Được gọi bởi Owner để thêm một email vào danh sách được phép.
 */
exports.addUserToAllowlist = onCall(async (request) => {
  if (request.auth?.token.role !== "owner") {
    throw new HttpsError(
      "permission-denied",
      "Chỉ owner mới có quyền thực hiện chức năng này."
    );
  }

  const { email, role } = request.data;
  if (!email || !role) {
    throw new HttpsError("invalid-argument", "Vui lòng cung cấp đủ email và vai trò.");
  }

  try {
    const emailLowerCase = email.toLowerCase();
    await db.collection("allowlist").doc(emailLowerCase).set({
      email: emailLowerCase,
      role: role,
      addedAt: new Date(),
    });
    return { success: true, message: `Đã thêm ${email} vào danh sách được phép.` };
  } catch (error) {
    console.error("Lỗi khi thêm vào allowlist:", error);
    throw new HttpsError("internal", "Đã xảy ra lỗi khi ghi vào cơ sở dữ liệu.");
  }
});

/**
 * Hàm 2: Được gọi khi người dùng đăng nhập bằng Google lần đầu tiên.
 */
exports.processNewGoogleUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Yêu cầu phải được xác thực.");
  }

  const uid = request.auth.uid;
  const email = request.auth.token.email;

  if (!email) {
    throw new HttpsError("invalid-argument", "Tài khoản Google không có email.");
  }

  const userDocRef = db.collection("users").doc(uid);
  const userDoc = await userDocRef.get();
  if (userDoc.exists) {
    return { success: true, message: "User đã được khởi tạo." };
  }

  const allowlistRef = db.collection("allowlist").doc(email.toLowerCase());
  const allowlistDoc = await allowlistRef.get();

  if (!allowlistDoc.exists) {
    await auth.deleteUser(uid);
    throw new HttpsError(
      "permission-denied",
      "Email của bạn không có trong danh sách được phép truy cập."
    );
  }

  const { role } = allowlistDoc.data();
  try {
    await auth.setCustomUserClaims(uid, { role: role });
    await userDocRef.set({
      email: email,
      role: role,
    });
    
    return { success: true, message: "Tài khoản đã được kích hoạt thành công!" };
  } catch (error) {
    console.error("Lỗi khi xử lý user mới:", error);
    throw new HttpsError("internal", "Đã xảy ra lỗi khi xử lý tài khoản mới.");
  }
});

/**
 * Hàm 3: Xóa người dùng khỏi hệ thống.
 */
exports.deleteUserAndAllowlist = onCall(async (request) => {
    if (request.auth?.token.role !== 'owner') {
        throw new HttpsError('permission-denied', 'Chỉ owner mới có quyền.');
    }
    const { email } = request.data;
    if (!email) {
        throw new HttpsError("invalid-argument", "Vui lòng cung cấp email để xóa.");
    }
    try {
        // Xóa khỏi allowlist trước
        await db.collection('allowlist').doc(email.toLowerCase()).delete();

        // Tìm user bằng email để lấy UID và xóa khỏi Authentication và collection 'users'
        const userRecord = await auth.getUserByEmail(email);
        if (userRecord) {
            await auth.deleteUser(userRecord.uid);
            await db.collection('users').doc(userRecord.uid).delete();
        }
        
        return { success: true, message: "Đã xóa user thành công." };
    } catch (error) {
        // Bỏ qua lỗi nếu không tìm thấy user, vì có thể họ chưa từng đăng nhập
        if (error.code === 'auth/user-not-found') {
            console.log(`User với email ${email} đã được xóa khỏi allowlist nhưng chưa từng đăng nhập.`);
            return { success: true, message: "Đã xóa user khỏi danh sách cho phép." };
        }
        console.error("Lỗi khi xóa user:", error);
        throw new HttpsError('internal', "Đã xảy ra lỗi khi xóa user.");
    }
});

/**
 * Hàm 4: Cập nhật vai trò của một user.
 */
exports.updateAllowlistRole = onCall(async (request) => {
  if (request.auth?.token.role !== "owner") {
    throw new HttpsError( "permission-denied", "Chỉ owner mới có quyền thực hiện chức năng này.");
  }

  const { email, newRole } = request.data;
  if (!email || !newRole) {
    throw new HttpsError("invalid-argument", "Vui lòng cung cấp đủ email và vai trò mới.");
  }
  
  // Không cho phép thay đổi vai trò của chính owner
  if (email.toLowerCase() === request.auth.token.email.toLowerCase()) {
      throw new HttpsError("permission-denied", "Không thể tự thay đổi vai trò của chính mình.");
  }

  try {
    const emailLowerCase = email.toLowerCase();
    const allowlistRef = db.collection("allowlist").doc(emailLowerCase);

    // Cập nhật vai trò trong allowlist
    await allowlistRef.update({ role: newRole });

    // Tìm user tương ứng trong Authentication để cập nhật custom claim
    const userRecord = await auth.getUserByEmail(email);
    if (userRecord) {
      await auth.setCustomUserClaims(userRecord.uid, { role: newRole });
      await db.collection("users").doc(userRecord.uid).update({ role: newRole });
    }

    return { success: true, message: `Đã cập nhật vai trò cho ${email} thành ${newRole}.` };
  } catch (error) {
    // Bỏ qua lỗi nếu không tìm thấy user, vì họ có thể chưa đăng nhập lần nào
    if (error.code === 'auth/user-not-found') {
        console.log(`Đã cập nhật vai trò cho ${email} trong allowlist. User này chưa đăng nhập.`);
        return { success: true, message: `Đã cập nhật vai trò cho ${email} thành ${newRole}.` };
    }
    console.error("Lỗi khi cập nhật vai trò:", error);
    throw new HttpsError("internal", "Đã xảy ra lỗi khi cập nhật vai trò.");
  }
});