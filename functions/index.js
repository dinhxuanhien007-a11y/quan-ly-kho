// functions/index.js

// Import các module cần thiết
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");

// --- ĐỊNH NGHĨA VÙNG CHUNG ---
const ASIA_REGION = "asia-southeast1";
// --- KẾT THÚC ĐỊNH NGHĨA VÙNG ---

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
// CÁC HÀM QUẢN LÝ USER VÀ QUYỀN (CHUYỂN VÙNG SANG ASIA)
// =================================================================

/**
 * Hàm 1: Được gọi bởi Owner để thêm một email vào danh sách được phép.
 */
exports.addUserToAllowlist = onCall({ region: ASIA_REGION }, async (request) => {
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
exports.processNewGoogleUser = onCall({ region: ASIA_REGION }, async (request) => {
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
exports.deleteUserAndAllowlist = onCall({ region: ASIA_REGION }, async (request) => {
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
exports.updateAllowlistRole = onCall({ region: ASIA_REGION }, async (request) => {
  if (request.auth?.token.role !== "owner") {
    throw new HttpsError( "permission-denied", "Chỉ owner mới có quyền thực hiện chức năng này.");
  }

  const { email, newRole } = request.data;
  if (!email || !newRole) {
    throw new HttpsError("invalid-argument", "Vui lòng cung cấp đủ email và vai trò mới.");
  }
  
  if (email.toLowerCase() === request.auth.token.email.toLowerCase()) {
      throw new HttpsError("permission-denied", "Không thể tự thay đổi vai trò của chính mình.");
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
// CÁC HÀM CẢNH BÁO HÀNG HẾT HẠN (CHUYỂN VÙNG SANG ASIA)
// =================================================================

/**
 * Hàm 5: Cloud Function chạy tự động mỗi ngày vào lúc 01:00 sáng.
 */
exports.checkExpiredLots = onSchedule({
  schedule: "every day 01:00",
  timeZone: "Asia/Ho_Chi_Minh",
  region: ASIA_REGION
}, async (event) => {
  logger.info("Bắt đầu quét các lô hàng hết hạn...");

  // 1. XÁC ĐỊNH NGÀY HÔM NAY (00:00:00)
  const today = new Date(); 
  today.setHours(0, 0, 0, 0); // Đặt giờ về 00:00:00

  const inventoryRef = db.collection("inventory_lots"); 
  
  // 2. TRUY VẤN: 
  //    - expiryDate < today (Lô hết hạn trước 00:00:00 hôm nay)
  //    - quantityRemaining > 0 (Chỉ lô còn tồn)
  const expiredLotsQuery = inventoryRef
    .where("expiryDate", "<", today) 
    .where("quantityRemaining", ">", 0); 
    
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
 * Hàm 6: Cloud Function được gọi để xác nhận đã xử lý một cảnh báo.
 */
exports.confirmExpiryNotification = onCall({ region: ASIA_REGION }, async (request) => {
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
  const lotRef = db.collection("inventory_lots").doc(lotId); // SỬA LỖI: Đổi tên collection

  try {
    await db.runTransaction(async (transaction) => {
      transaction.update(notificationRef, {
        status: "CONFIRMED",
        confirmedBy: uid,
        confirmedAt: timestamp,
      });
      // Logic xử lý lô hàng (ví dụ: đổi trạng thái) có thể thêm ở đây nếu cần
      // transaction.update(lotRef, { inventoryStatus: "EXPIRED_HANDLED" });
    });

    logger.info(`User ${uid} đã xác nhận cảnh báo ${notificationId} cho lô ${lotId}.`);
    return { success: true, message: "Xác nhận thành công!" };

  } catch (error) {
    logger.error("Lỗi khi chạy transaction xác nhận:", error);
    throw new HttpsError("internal", "Đã xảy ra lỗi khi xác nhận.");
  }
});


// =================================================================
// === HÀM TỰ ĐỘNG ĐỒNG BỘ PRODUCT_SUMMARIES (CHUYỂN VÙNG SANG ASIA) ===
// =================================================================

/**
 * Hàm 7: Tự động kích hoạt mỗi khi có một document trong 'inventory_lots'
 * được TẠO, SỬA, hoặc XÓA.
 */
exports.updateProductSummary = onDocumentWritten({
    document: "/inventory_lots/{lotId}",
    region: ASIA_REGION // <-- ĐÃ THÊM region
}, async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  const productId = afterData?.productId || beforeData?.productId;

  if (!productId) {
    logger.log(`Không tìm thấy productId cho lotId: ${event.params.lotId}. Bỏ qua.`);
    return null;
  }

  logger.log(`Bắt đầu cập nhật summary cho sản phẩm: ${productId}`);

  // 1. TRUY VẤN TẤT CẢ CÁC LÔ CÒN LẠI CỦA SẢN PHẨM NÀY
  const lotsCollectionRef = db.collection("inventory_lots");
  const lotsQuery = lotsCollectionRef
    .where("productId", "==", productId)
    .where("quantityRemaining", ">", 0);

  const lotsSnapshot = await lotsQuery.get();
  const summaryDocRef = db.collection("product_summaries").doc(productId);

  // 2. NẾU KHÔNG CÒN LÔ NÀO TỒN KHO > 0
  if (lotsSnapshot.empty) {
    logger.log(`Sản phẩm ${productId} đã hết hàng. Xóa document summary.`);
    await summaryDocRef.delete();
    return null;
  }

  // 3. NẾU CÒN TỒN KHO, TÍNH TOÁN LẠI DỮ LIỆU TỔNG HỢP
  let totalRemaining = 0;
  let nearestExpiryDate = null;

  lotsSnapshot.forEach((doc) => {
    const lot = doc.data();
    totalRemaining += lot.quantityRemaining;
    if (lot.expiryDate) {
      if (!nearestExpiryDate || lot.expiryDate.toMillis() < nearestExpiryDate.toMillis()) {
        nearestExpiryDate = lot.expiryDate;
      }
    }
  });

  // 4. LẤY THÔNG TIN GỐC TỪ COLLECTION 'products'
  const productDocRef = db.collection("products").doc(productId);
  const productDoc = await productDocRef.get();

  if (!productDoc.exists) {
    logger.error(`Không tìm thấy document gốc cho sản phẩm ${productId} trong collection 'products'.`);
    // Nếu sản phẩm gốc bị xóa, cũng nên xóa summary
    await summaryDocRef.delete();
    return null;
  }
  const productData = productDoc.data();

  // 5. TẠO DỮ LIỆU MỚI VÀ CẬP NHẬT 'product_summaries'
  const summaryData = {
    productName: productData.productName,
    unit: productData.unit,
    packaging: productData.packaging || "",
    storageTemp: productData.storageTemp || "",
    manufacturer: productData.manufacturer || "",
    team: productData.team,
    totalRemaining: totalRemaining,
    nearestExpiryDate: nearestExpiryDate,
    lastUpdatedAt: FieldValue.serverTimestamp(),
  };

  logger.log(`Cập nhật summary cho ${productId} với tổng tồn là ${totalRemaining}.`);
  await summaryDocRef.set(summaryData, { merge: true }); // Dùng merge để không ghi đè các trường khác nếu có

  return null;
});

// =================================================================
// === HÀM LƯU TRỮ DỮ LIỆU HÀNG THÁNG (ARCHIVE MONTHLY DATA) ===
// =================================================================

/**
 * Hàm 8: Cloud Function chạy tự động để di chuyển phiếu nhập/xuất đã hoàn thành 
 * của tháng trước sang collection lưu trữ.
 * Cần sử dụng Batch Write và Recursive Call cho dữ liệu lớn.
 */
exports.archiveMonthlyData = onSchedule({
    schedule: "1 0 1 * *", // Chạy lúc 00:01 sáng ngày 1 đầu tháng
    timeZone: "Asia/Ho_Chi_Minh", 
    region: ASIA_REGION // BẮT BUỘC
}, async (event) => {
    logger.info("BẮT ĐẦU LƯU TRỮ dữ liệu tháng trước...");
    
    // --- BƯỚC 1: XÁC ĐỊNH PHẠM VI DỮ LIỆU ---
    // Tính toán phạm vi Timestamp của tháng trước theo múi giờ Việt Nam
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthEnd = new Date(currentMonthStart.getTime() - 1);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);

    logger.info(`Lưu trữ dữ liệu từ: ${lastMonthStart.toISOString()} đến ${lastMonthEnd.toISOString()}`);
    
    const collectionsToArchive = ['import_tickets', 'export_tickets'];
    let totalArchivedCount = 0;

    for (const collectionName of collectionsToArchive) {
        let lastDoc = null;
        let batchCount = 0;
        
        while (true) {
            let query = db.collection(collectionName)
                .where('status', '==', 'completed')
                .where('createdAt', '>=', lastMonthStart)
                .where('createdAt', '<=', lastMonthEnd)
                .orderBy('createdAt')
                .limit(499); // Giới hạn dưới 500 để an toàn cho Batch

            if (lastDoc) {
                query = query.startAfter(lastDoc);
            }

            const snapshot = await query.get();
            if (snapshot.empty) break;

            const archiveBatch = db.batch();
            const archiveCollectionRef = db.collection(`archive_${collectionName}`);
            
            snapshot.forEach(doc => {
                const data = doc.data();
                
                // 1. Ghi vào collection lưu trữ (archive_...)
                archiveBatch.set(archiveCollectionRef.doc(doc.id), data);
                
                // 2. Xóa khỏi collection gốc
                archiveBatch.delete(db.collection(collectionName).doc(doc.id));

                lastDoc = doc;
            });

            await archiveBatch.commit();
            totalArchivedCount += snapshot.size;
            batchCount++;
            
            logger.log(`Hoàn tất Batch ${batchCount} cho ${collectionName}: Đã lưu trữ ${snapshot.size} phiếu.`);
            
            // Nếu snapshot.size < limit, có thể kết thúc hoặc đợi một chút (nếu muốn chia nhỏ công việc nhiều hơn)
            if (snapshot.size < 499) break;
        }
    }

    logger.info(`KẾT THÚC LƯU TRỮ. Tổng cộng đã lưu trữ ${totalArchivedCount} phiếu.`);
    return null;
});


// =================================================================
// === HÀM NHẬN DẠNG GIỌNG NÓI (SPEECH-TO-TEXT) (GIỮ NGUYÊN ASIA) ===
// =================================================================
const speech = require("@google-cloud/speech");

// Khởi tạo client cho Speech-to-Text một lần duy nhất
const speechClient = new speech.SpeechClient();

/**
 * Hàm 9: Cloud Function được gọi từ client để nhận dạng giọng nói.
 */
exports.transcribeAudio = onCall({
    region: ASIA_REGION // <-- ĐÃ ĐƯỢC CHỈ ĐỊNH
}, async (request) => {
    // Lấy dữ liệu âm thanh dưới dạng base64 từ client
    const audioBytes = request.data.audioData;

    if (!audioBytes) {
        throw new HttpsError(
            "invalid-argument",
            "Yêu cầu không chứa dữ liệu âm thanh.",
        );
    }

    const audio = {
        content: audioBytes,
    };

    // Cấu hình nhận dạng giọng nói cho Tiếng Việt
    const config = {
        encoding: "WEBM_OPUS", // Định dạng audio phổ biến trên web khi ghi âm từ trình duyệt
        sampleRateHertz: 48000, // Tần số mẫu chuẩn
        languageCode: "vi-VN",   // Ngôn ngữ Tiếng Việt
        model: "default",      // Mô hình nhận dạng tiêu chuẩn
    };

    const apiRequest = {
        audio: audio,
        config: config,
    };

    try {
        // Gửi yêu cầu đến Google Cloud Speech-to-Text API
        const [response] = await speechClient.recognize(apiRequest);
        const transcription = response.results
            .map((result) => result.alternatives[0].transcript)
            .join("\n");

        logger.log(`Kết quả nhận dạng: ${transcription}`);
        
        // Trả kết quả về cho client
        return { transcript: transcription };

    } catch (error) {
        logger.error("LỖI Speech-to-Text:", error);
        throw new HttpsError(
            "internal",
            "Đã xảy ra lỗi khi xử lý âm thanh.",
            error,
        );
    }
});