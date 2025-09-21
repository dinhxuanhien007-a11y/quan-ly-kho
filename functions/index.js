// functions/index.js

// Import các module cần thiết từ Firebase Functions và Admin SDK
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");

// Khởi tạo các dịch vụ của Firebase
initializeApp();
const db = getFirestore();
const auth = getAuth();

/**
 * Hàm hỗ trợ: Trả về ngày hôm nay theo định dạng "dd/mm/yyyy" tại múi giờ Việt Nam.
 * @returns {string} Chuỗi ngày hôm nay.
 */
function getTodayInVietnam() {
  const today = new Date();
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  };
  const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(today);
  const day = parts.find(p => p.type === 'day').value;
  const month = parts.find(p => p.type === 'month').value;
  const year = parts.find(p => p.type === 'year').value;
  return `${day}/${month}/${year}`;
}

// =================================================================
// CÁC HÀM QUẢN LÝ USER VÀ QUYỀN (CODE GỐC CỦA BẠN)
// =================================================================

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
    logger.error("Lỗi khi thêm vào allowlist:", error);
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
    logger.error("Lỗi khi xử lý user mới:", error);
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
        await db.collection('allowlist').doc(email.toLowerCase()).delete();

        const userRecord = await auth.getUserByEmail(email);
        if (userRecord) {
            await auth.deleteUser(userRecord.uid);
            await db.collection('users').doc(userRecord.uid).delete();
        }
        
        return { success: true, message: "Đã xóa user thành công." };
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            logger.log(`User với email ${email} đã được xóa khỏi allowlist nhưng chưa từng đăng nhập.`);
            return { success: true, message: "Đã xóa user khỏi danh sách cho phép." };
        }
        logger.error("Lỗi khi xóa user:", error);
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
  
  if (email.toLowerCase() === request.auth.token.email.toLowerCase()) {
      throw new HpsError("permission-denied", "Không thể tự thay đổi vai trò của chính mình.");
  }

  try {
    const emailLowerCase = email.toLowerCase();
    const allowlistRef = db.collection("allowlist").doc(emailLowerCase);

    await allowlistRef.update({ role: newRole });

    const userRecord = await auth.getUserByEmail(email);
    if (userRecord) {
      await auth.setCustomUserClaims(userRecord.uid, { role: newRole });
      await db.collection("users").doc(userRecord.uid).update({ role: newRole });
    }

    return { success: true, message: `Đã cập nhật vai trò cho ${email} thành ${newRole}.` };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
        logger.log(`Đã cập nhật vai trò cho ${email} trong allowlist. User này chưa đăng nhập.`);
        return { success: true, message: `Đã cập nhật vai trò cho ${email} thành ${newRole}.` };
    }
    logger.error("Lỗi khi cập nhật vai trò:", error);
    throw new HttpsError("internal", "Đã xảy ra lỗi khi cập nhật vai trò.");
  }
});


// =================================================================
// CÁC HÀM MỚI: CHỨC NĂNG CẢNH BÁO HÀNG HẾT HẠN
// =================================================================

/**
 * Hàm 5 (Mới): Cloud Function chạy tự động mỗi ngày vào lúc 01:00 sáng.
 * Quét toàn bộ kho để tìm các lô hàng hết hạn vào đúng ngày hôm nay.
 */
exports.checkExpiredLots = onSchedule({
  schedule: "every day 01:00",
  timeZone: "Asia/Ho_Chi_Minh",
}, async (event) => {
  logger.info("Bắt đầu quét các lô hàng hết hạn...");

  const todayString = getTodayInVietnam();
  logger.log(`Ngày quét: ${todayString}`);

  const inventoryRef = db.collection("inventory");
  const expiredLotsQuery = inventoryRef
    .where("expiryDate", "==", todayString)
    .where("quantity", ">", 0);

  const snapshot = await expiredLotsQuery.get();

  if (snapshot.empty) {
    logger.info("Không tìm thấy lô hàng nào hết hạn hôm nay.");
    return null;
  }

  const batch = db.batch();
  const notificationsRef = db.collection("notifications");

  snapshot.forEach(doc => {
    const lotData = doc.data();
    const notificationMessage = `Lô '${lotData.lotNumber}' của sản phẩm '${lotData.productId} - ${lotData.productName}' đã hết hạn sử dụng.`;
    
    const newNotifRef = notificationsRef.doc();
    batch.set(newNotifRef, {
      lotId: doc.id,
      productId: lotData.productId,
      lotNumber: lotData.lotNumber,
      productName: lotData.productName,
      expiryDate: lotData.expiryDate,
      message: notificationMessage,
      status: "UNCONFIRMED",
      createdAt: FieldValue.serverTimestamp(),
      confirmedBy: null,
      confirmedAt: null,
    });
    logger.log(`Đã tạo cảnh báo cho lô: ${doc.id}`);
  });

  await batch.commit();
  logger.info(`Hoàn tất. Đã tạo ${snapshot.size} cảnh báo mới.`);
  return null;
});


/**
 * Hàm 6 (Mới): Cloud Function được gọi từ client để xác nhận đã xử lý một cảnh báo.
 * Cập nhật trạng thái của cả thông báo và lô hàng liên quan.
 */
exports.confirmExpiryNotification = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Bạn phải đăng nhập để thực hiện hành động này.");
  }

  const { notificationId, lotId } = request.data;
  if (!notificationId || !lotId) {
    throw new HttpsError("invalid-argument", "Thiếu notificationId hoặc lotId.");
  }

  const uid = request.auth.uid;
  const timestamp = FieldValue.serverTimestamp();

  const notificationRef = db.collection("notifications").doc(notificationId);
  const lotRef = db.collection("inventory").doc(lotId);

  try {
    await db.runTransaction(async (transaction) => {
      transaction.update(notificationRef, {
        status: "CONFIRMED",
        confirmedBy: uid,
        confirmedAt: timestamp,
      });
      transaction.update(lotRef, {
        inventoryStatus: "EXPIRED_HANDLED"
      });
    });

    logger.info(`User ${uid} đã xác nhận cảnh báo ${notificationId} cho lô ${lotId}.`);
    return { success: true, message: "Xác nhận thành công!" };

  } catch (error) {
    logger.error("Lỗi khi chạy transaction xác nhận:", error);
    throw new HttpsError("internal", "Đã xảy ra lỗi khi xác nhận.");
  }
});