// functions/index.js

// --- Khai báo các thư viện cần thiết ---
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

// --- Khởi tạo Firebase Admin SDK ---
initializeApp();
const db = getFirestore();
const auth = getAuth();

// ========================================================================
// HÀM 1: MỜI USER MỚI (ĐÃ NÂNG CẤP)
// Chức năng: Tạo user, gán vai trò, và báo thành công về client.
// Client sẽ gọi lệnh để Firebase tự động gửi email mời.
// ========================================================================
exports.inviteUser = onCall(async (request) => {
    // 1. Kiểm tra quyền: Chỉ owner mới được thực hiện
    // Lưu ý: Phiên bản SDK mới sử dụng request.auth.token.<claim>
    // ví dụ: request.auth.token.owner === true
    if (!request.auth || request.auth.token.owner !== true) {
        throw new HttpsError('permission-denied', 'Chỉ có owner mới được quyền mời người dùng mới.');
    }

    const { email, role } = request.data;
    if (!email || !role) {
        throw new HttpsError('invalid-argument', 'Vui lòng cung cấp đủ email và vai trò.');
    }

    try {
        // 2. Tạo user trong Firebase Authentication
        const userRecord = await auth.createUser({ email, emailVerified: false });
        
        // 3. Gán vai trò (role) cho user vừa tạo dưới dạng custom claim
        // Ví dụ: nếu role là 'admin', claim sẽ là { admin: true }
        await auth.setCustomUserClaims(userRecord.uid, { [role]: true });

        // 4. Tạo document tương ứng trong Firestore collection 'users'
        // để lưu trữ vai trò và email cho dễ truy vấn
        await db.collection('users').doc(userRecord.uid).set({
            role: role,
            email: email 
        });

        // 5. Trả về thông báo thành công. KHÔNG trả về link nữa.
        return { success: true, message: "Tạo user và phân quyền thành công. Client sẽ kích hoạt gửi email." };

    } catch (error) {
        logger.error("Lỗi khi tạo user mới:", error);
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Địa chỉ email này đã được sử dụng.');
        }
        throw new HttpsError('internal', 'Đã xảy ra lỗi phía server khi tạo user.');
    }
});


// ========================================================================
// HÀM 2: ĐẶT VAI TRÒ CHO USER (ĐÃ KÍCH HOẠT BẢO MẬT)
// ========================================================================
exports.setRole = onCall(async (request) => {
    if (!request.auth || request.auth.token.owner !== true) {
        throw new HttpsError('permission-denied', 'Chỉ có owner mới được quyền thực hiện hành động này.');
    }

    const { uid, role } = request.data;
    if (!uid || !role) {
        throw new HttpsError('invalid-argument', 'Vui lòng cung cấp UID và vai trò.');
    }

    try {
        await auth.setCustomUserClaims(uid, { [role]: true });
        await db.collection('users').doc(uid).update({ role: role });

        return { success: true, message: `Vai trò của user ${uid} đã được cập nhật thành ${role}` };
    } catch (error) {
        logger.error("Lỗi khi đặt vai trò:", error);
        throw new HttpsError('internal', 'Đã xảy ra lỗi khi đặt vai trò.');
    }
});


// ========================================================================
// HÀM 3: TỰ ĐỘNG LƯU TRỮ DỮ LIỆU HÀNG THÁNG
// ========================================================================
exports.archiveMonthlyData = onSchedule("1 1 1 * *", async () => {
  logger.info("Bắt đầu tác vụ chốt kỳ và lưu trữ hàng tháng.");

  const now = new Date();
  const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  try {
    await archiveCollection("import_tickets", startOfPreviousMonth, endOfPreviousMonth);
    await archiveCollection("export_tickets", startOfPreviousMonth, endOfPreviousMonth);
    logger.info("Tác vụ lưu trữ hàng tháng đã hoàn tất thành công!");
    return null;
  } catch (error) {
    logger.error("Đã xảy ra lỗi nghiêm trọng trong quá trình lưu trữ:", error);
    return null;
  }
});

// Hàm trợ giúp cho việc lưu trữ
async function archiveCollection(sourceCollectionName, startDate, endDate) {
  const archiveCollectionName = `${sourceCollectionName}_archive_${startDate.getFullYear()}_${String(startDate.getMonth() + 1).padStart(2, "0")}`;
  logger.info(`Bắt đầu lưu trữ collection: ${sourceCollectionName} cho kỳ từ ${startDate.toLocaleDateString()} đến ${endDate.toLocaleDateString()}`);
  logger.info(`Dữ liệu sẽ được chuyển đến: ${archiveCollectionName}`);

  const query = db.collection(sourceCollectionName)
      .where("createdAt", ">=", startDate)
      .where("createdAt", "<=", endDate)
      .where("status", "in", ["completed", "cancelled"]);

  const snapshot = await query.get();

  if (snapshot.empty) {
    logger.info(`Không tìm thấy tài liệu nào để lưu trữ trong ${sourceCollectionName}.`);
    return;
  }

  logger.info(`Tìm thấy ${snapshot.size} tài liệu để di chuyển.`);
  
  const MAX_OPERATIONS_PER_BATCH = 499;
  let batch = db.batch();
  let operationCount = 0;

  for (const doc of snapshot.docs) {
    const docData = doc.data();
    const archiveRef = db.collection(archiveCollectionName).doc(doc.id);
    batch.set(archiveRef, docData);
    batch.delete(doc.ref);
    operationCount += 2;

    if (operationCount >= MAX_OPERATIONS_PER_BATCH) {
      await batch.commit();
      logger.info(`Đã thực thi một lô ${operationCount} thao tác.`);
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
    logger.info(`Đã thực thi lô cuối cùng với ${operationCount} thao tác.`);
  }

  logger.info(`Hoàn tất lưu trữ cho ${sourceCollectionName}.`);
}


// ========================================================================
// HÀM 4: CẬP NHẬT EMAIL CHO CÁC USER ĐÃ CÓ (CHẠY THỦ CÔNG)
// ========================================================================
exports.backfillUserEmails = onCall({ enforceAppCheck: false }, async (request) => {
    logger.info("Bắt đầu backfill email cho user...");
    
    try {
        const listUsersResult = await auth.listUsers(1000);
        const batch = db.batch();
        let count = 0;

        for (const userRecord of listUsersResult.users) {
            const userDocRef = db.collection('users').doc(userRecord.uid);
            batch.update(userDocRef, { email: userRecord.email });
            count++;
        }

        await batch.commit();
        const message = `Đã cập nhật thành công email cho ${count} user.`;
        logger.info(message);
        return { success: true, message: message };

    } catch (error) {
        logger.error("Lỗi khi backfill email:", error);
        throw new HttpsError('internal', 'Đã xảy ra lỗi khi cập nhật email cho các user đã có.');
    }
});


// ========================================================================
// HÀM 5: XÓA USER TOÀN DIỆN
// ========================================================================
exports.deleteUser = onCall(async (request) => {
    if (!request.auth || request.auth.token.owner !== true) {
        throw new HttpsError('permission-denied', 'Chỉ có owner mới được quyền xóa người dùng.');
    }

    const { uid } = request.data;
    if (!uid) {
        throw new HttpsError('invalid-argument', 'Vui lòng cung cấp UID của người dùng cần xóa.');
    }

    try {
        await auth.deleteUser(uid);
        await db.collection('users').doc(uid).delete();

        logger.info(`Đã xóa thành công user có UID: ${uid}`);
        return { success: true, message: "Xóa người dùng thành công!" };

    } catch (error) {
        logger.error(`Lỗi khi xóa user ${uid}:`, error);
        if (error.code === 'auth/user-not-found') {
            throw new HttpsError('not-found', 'Không tìm thấy người dùng trong hệ thống Authentication.');
        }
        throw new HttpsError('internal', 'Đã xảy ra lỗi phía server khi xóa user.');
    }
});