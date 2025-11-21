// functions/index.js

// Import các module cần thiết
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore"); // <-- THÊM Timestamp
const { getAuth } = require("firebase-admin/auth");
const functions = require("firebase-functions"); // <-- THÊM DÒNG NÀY (CHO LOGGING)
const logger = require("firebase-functions/logger");
const speech = require("@google-cloud/speech"); // <-- DI CHUYỂN LÊN ĐÂY

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


// File: functions/index.js

// ===================================================================================
// === HÀM KIỂM TRA HẠN SỬ DỤNG (PHIÊN BẢN SỬA LỖI) ===
// ===================================================================================
exports.checkexpiredlots = onSchedule({ // Giữ nguyên tên chữ thường để deploy
    schedule: "every day 01:00",
    timeZone: "Asia/Ho_Chi_Minh",
    region: ASIA_REGION
}, async (event) => {
    logger.info("Bắt đầu quét các lô hàng hết hạn (phiên bản sửa lỗi)...");

    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const expiredLotsQuery = db.collection("inventory_lots")
        .where("expiryDate", "<", today)
        .where("quantityRemaining", ">", 0);

    try {
        const [expiredLotsSnapshot, notificationsSnapshot] = await Promise.all([
            expiredLotsQuery.get(),
            // THAY ĐỔI 1: Lấy ID của TẤT CẢ thông báo đã tồn tại
            db.collection("notifications").get() 
        ]);

        if (expiredLotsSnapshot.empty) {
            logger.info("Không tìm thấy lô hàng nào hết hạn.");
            return null;
        }

        // Tạo một Set chứa ID của tất cả các lô hàng đã từng được thông báo
        const existingNotificationLotIds = new Set(notificationsSnapshot.docs.map(doc => doc.id));

        const batch = db.batch();
        let newNotificationCount = 0;

        expiredLotsSnapshot.forEach(doc => {
            const lot = doc.data();
            const lotId = doc.id;

            // THAY ĐỔI 2: Logic kiểm tra đã được sửa
            // Chỉ tạo thông báo mới nếu ID của lô hàng này CHƯA TỪNG tồn tại trong collection notifications
            if (!existingNotificationLotIds.has(lotId)) {
                const newNotifRef = db.collection("notifications").doc(lotId);
                const message = `Lô '${lot.lotNumber || 'N/A'}' của sản phẩm '${lot.productId} - ${lot.productName}' đã hết hạn sử dụng.`;
                
                batch.set(newNotifRef, {
                    lotId: lotId,
                    message: message,
                    createdAt: FieldValue.serverTimestamp(),
                    status: "UNCONFIRMED" // Luôn tạo mới với trạng thái này
                });

                newNotificationCount++;
                logger.info(`Đã thêm thông báo MỚI cho lô: ${lotId}`);
            }
        });

        if (newNotificationCount > 0) {
            await batch.commit();
            logger.info(`Hoàn tất! Đã tạo ${newNotificationCount} thông báo hết hạn mới.`);
        } else {
            logger.info("Không có lô hàng hết hạn mới nào cần tạo thông báo.");
        }

        return null;

    } catch (error) {
        logger.error("Lỗi khi quét lô hàng hết hạn:", error);
        return null;
    }
});

// ===================================================================================
// === HÀM 2: XỬ LÝ KHI USER BẤM NÚT "XÁC NHẬN" (HÀM MỚI BỔ SUNG) ===
// ===================================================================================
// File: functions/index.js

// ===================================================================================
// === HÀM XỬ LÝ KHI USER BẤM NÚT "XÁC NHẬN" (PHIÊN BẢN SẠCH SẼ) ===
// ===================================================================================
exports.confirmExpiryNotification = onCall({
    region: ASIA_REGION,
}, async (request) => {
    // 1. KIỂM TRA QUYỀN HẠN: Chỉ 'owner' hoặc 'admin' mới được thực hiện
    if (!request.auth || !['owner', 'admin'].includes(request.auth.token.role)) {
        logger.error("Yêu cầu bị từ chối. Người dùng không có quyền admin hoặc owner.", { uid: request.auth ? request.auth.uid : 'none' });
        throw new HttpsError('permission-denied', 'Bạn không có quyền thực hiện hành động này.');
    }

    // Lấy notificationId từ dữ liệu gửi lên (bỏ lotId vì không cần nữa)
    const { notificationId } = request.data;
    const confirmedBy = request.auth.uid;

    if (!notificationId) {
        logger.error("Yêu cầu không hợp lệ, thiếu notificationId.", request.data);
        throw new HttpsError('invalid-argument', 'Yêu cầu không hợp lệ, vui lòng cung cấp đủ thông tin.');
    }

    logger.info(`Bắt đầu xử lý xác nhận cho thông báo: ${notificationId} bởi user: ${confirmedBy}`);
    
    // 2. TIẾN HÀNH CẬP NHẬT TRẠNG THÁI CỦA THÔNG BÁO
    const notificationRef = db.collection('notifications').doc(notificationId);

    try {
        // Chỉ cập nhật trạng thái của thông báo để ẩn nó đi khỏi banner
        await notificationRef.update({
            status: 'CONFIRMED',
            confirmedBy: confirmedBy,
            confirmedAt: FieldValue.serverTimestamp()
        });

        logger.info(`Xác nhận thành công, đã ẩn thông báo ${notificationId}.`);
        return { success: true, message: "Đã ẩn thông báo thành công!" };

    } catch (error) {
        logger.error(`Lỗi khi xử lý xác nhận cho thông báo ${notificationId}:`, error);
        throw new HttpsError('internal', 'Đã xảy ra lỗi khi cập nhật cơ sở dữ liệu.');
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
    region: ASIA_REGION 
}, async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Lấy productId (có thể từ dữ liệu cũ hoặc mới)
    const productId = afterData?.productId || beforeData?.productId;

    if (!productId) {
        logger.log(`Không tìm thấy productId cho lotId: ${event.params.lotId}. Bỏ qua.`);
        return null;
    }

    logger.log(`Bắt đầu tính toán lại tồn kho cho sản phẩm: ${productId}`);

    // 1. TRUY VẤN TẤT CẢ CÁC LÔ CÒN LẠI CỦA SẢN PHẨM NÀY
    const lotsCollectionRef = db.collection("inventory_lots");
    const lotsQuery = lotsCollectionRef
        .where("productId", "==", productId)
        .where("quantityRemaining", ">", 0);

    const lotsSnapshot = await lotsQuery.get();
    
    // Khai báo tham chiếu đến các document cần cập nhật
    const summaryDocRef = db.collection("product_summaries").doc(productId);
    const productDocRef = db.collection("products").doc(productId);

    // 2. NẾU KHÔNG CÒN LÔ NÀO (HẾT HÀNG)
    if (lotsSnapshot.empty) {
        logger.log(`Sản phẩm ${productId} đã hết hàng.`);
        
        // Xóa summary
        const deleteSummary = summaryDocRef.delete();
        
        // Cập nhật sản phẩm gốc về 0
        const updateProduct = productDocRef.update({
            totalRemaining: 0,
            nearestExpiryDate: null,
            hasInventory: false // Cờ đánh dấu hết hàng (tuỳ chọn)
        });

        await Promise.all([deleteSummary, updateProduct]);
        return null;
    }

    // 3. TÍNH TOÁN DỮ LIỆU TỔNG HỢP
    let totalRemaining = 0;
    let nearestExpiryDate = null;

    lotsSnapshot.forEach((doc) => {
        const lot = doc.data();
        totalRemaining += lot.quantityRemaining;
        
        // Tìm HSD gần nhất
        if (lot.expiryDate) {
            if (!nearestExpiryDate || lot.expiryDate.toMillis() < nearestExpiryDate.toMillis()) {
                nearestExpiryDate = lot.expiryDate;
            }
        }
    });

    // 4. LẤY THÔNG TIN GỐC (để cập nhật summary)
    const productDoc = await productDocRef.get();

    if (!productDoc.exists) {
        logger.error(`Không tìm thấy sản phẩm ${productId} trong 'products'. Xóa summary.`);
        await summaryDocRef.delete();
        return null;
    }
    const productData = productDoc.data();

    // 5. CHUẨN BỊ DỮ LIỆU
    // Dữ liệu cho product_summaries (giữ nguyên như cũ để tương thích ngược nếu cần)
    const summaryData = {
        productName: productData.productName,
        unit: productData.unit,
        packaging: productData.packaging || "",
        storageTemp: productData.storageTemp || "",
        manufacturer: productData.manufacturer || "",
        team: productData.team,
        subGroup: productData.subGroup || "",
        totalRemaining: totalRemaining,
        nearestExpiryDate: nearestExpiryDate,
        lastUpdatedAt: FieldValue.serverTimestamp(),
        inventoryHistory: [], 
    };

    // 6. THỰC HIỆN CẬP NHẬT SONG SONG
    // Cập nhật bảng Summary
    const updateSummaryPromise = summaryDocRef.set(summaryData, { merge: true });

    // === QUAN TRỌNG: Cập nhật ngược lại vào bảng Products ===
    const updateProductPromise = productDocRef.update({
        totalRemaining: totalRemaining,         // <-- Lưu số lượng tồn vào đây
        nearestExpiryDate: nearestExpiryDate,   // <-- Lưu HSD gần nhất vào đây
        hasInventory: true                      // <-- Đánh dấu có hàng
    });

    await Promise.all([updateSummaryPromise, updateProductPromise]);
    
    logger.log(`Đã cập nhật đồng bộ cho ${productId}. Tổng tồn: ${totalRemaining}`);
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

/**
 * Hàm 9: Cloud Function được gọi từ client để nhận dạng giọng nói.
 */
exports.transcribeAudio = onCall({
    region: ASIA_REGION // <-- ĐÃ ĐƯỢC CHỈ ĐỊNH
}, async (request) => {
  const speechClient = new speech.SpeechClient();
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