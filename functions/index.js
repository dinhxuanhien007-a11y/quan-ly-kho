// functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.inviteUser = functions.https.onCall(async (data, context) => {
  // --- Bước 1: Kiểm tra bảo mật ---
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Bạn phải đăng nhập.");
  }
  const callerDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
  if (callerDoc.data().role !== "owner") {
    throw new functions.https.HttpsError("permission-denied", "Bạn không có quyền thực hiện thao tác này.");
  }

  // --- Bước 2: Kiểm tra dữ liệu đầu vào ---
  const { email, role } = data;
  if (!email || !role) {
    throw new functions.https.HttpsError("invalid-argument", "Vui lòng cung cấp email và vai trò.");
  }

  // --- Bước 3: Thực hiện tạo User và Link ---
  try {
    const userRecord = await admin.auth().createUser({ email: email, emailVerified: false });
    
    await admin.firestore().collection("users").doc(userRecord.uid).set({ role: role });

    // MỚI: Tạo link để người dùng tự đặt mật khẩu
    const link = await admin.auth().generatePasswordResetLink(email);

    // Trả về kết quả thành công KÈM THEO ĐƯỜNG LINK
    return {
      success: true,
      message: `Đã tạo user ${email}. Vui lòng gửi link dưới đây cho họ để đặt mật khẩu.`,
      link: link, // <-- Trả link về cho giao diện
    };
  } catch (error) {
    console.error("Lỗi khi tạo user:", error);
    if (error.uid) {
        await admin.auth().deleteUser(error.uid);
    }
    throw new functions.https.HttpsError("internal", "Đã có lỗi xảy ra: " + error.message);
  }
});