// D:\quan-ly-kho\scripts\migration.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Sử dụng file key bạn đã có

// Khởi tạo Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Bạn có thể cần thêm databaseURL hoặc storageBucket nếu cần,
  // nhưng với Firestore thì không bắt buộc.
});

const db = admin.firestore();
const BATCH_SIZE = 499; // Giới hạn an toàn

// D:\quan-ly-kho\scripts\migration.js (Thay thế hàm getConversionFactor)

/**
 * PHIÊN BẢN CUỐI CÙNG VÀ MẠNH MẼ: Ưu tiên lấy Factor từ CẶP SỐ THỨ HAI 
 * (Cặp số lượng ĐVT lớn nhất).
 */
function getConversionFactor(packagingStr) {
    if (!packagingStr || packagingStr.toUpperCase() === "N/A") return 1;

    // 1. Loại bỏ các ký tự phi số (trừ dấu chấm và dấu /) và chuẩn hóa khoảng trắng
    let cleanedStr = packagingStr
        .replace(/,/g, ' ') 
        .replace(/x/g, '/')
        .replace(/[a-zA-Z]/g, ' ')
        .replace(/[^0-9\/\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
        
    // 2. Tìm TẤT CẢ các cặp số (tách bởi khoảng trắng)
    const allNumbers = cleanedStr.match(/(\d+(\.\d+)?)/g);
    
    if (allNumbers && allNumbers.length > 0) {
        let factorsToConsider = allNumbers;

        // BỔ SUNG LOGIC: NẾU CÓ NHIỀU HƠN 2 SỐ, BỎ QUA CẶP ĐẦU TIÊN (DUNG TÍCH)
        // VD: ["4.5", "100", "500"] -> Lấy 100
        if (allNumbers.length >= 2) {
             // Giả sử cặp đầu tiên là dung tích/cấp nhỏ (25 Lọ/Khay) và ta muốn 20 Khay/Thùng.
             factorsToConsider = allNumbers.slice(1);
        }
        
        let bestFactor = 1;
        
        // DUYỆT TẤT CẢ CÁC SỐ ĐƯỢC CHỌN VÀ LẤY SỐ LỚN NHẤT
        factorsToConsider.forEach(numStr => {
            const factor = Math.round(Number(numStr));
            if (factor > bestFactor) {
                bestFactor = factor;
            }
        });
        
        // Trường hợp 491452: Factors là ["25", "20"]. Lấy 25 (bestFactor).
        // Chúng ta cần ép nó thành 20.
        // CÁCH KHÓA: Chỉ ưu tiên LỌ/TEST/CÁI (Đơn vị nhỏ) nếu không có đơn vị đóng gói lớn hơn
        // Vì Khay/Thùng là đơn vị lớn, ta nên lấy số lượng của nó (20).

        // LOGIC KHÓA FACTOR: Đối với các mã có tỷ lệ đóng gói rõ ràng, ta lấy số thứ N.
        if (packagingStr.includes('Khay /Thùng') || packagingStr.includes('Cái/ Thùng')) {
             // Lấy số cuối cùng (Factor 20 từ 20 Khay/Thùng)
             const lastNumber = allNumbers[allNumbers.length - 1];
             return Math.round(Number(lastNumber));
        }

        return bestFactor > 1 ? bestFactor : 1; 
    } 
    
    return 1;
}


/**
 * Hàm chính: Quét và thêm trường conversionFactor vào products.
 */
async function runMigration() {
    console.log("--- BẮT ĐẦU DI TRÚ DỮ LIỆU SẢN PHẨM ---");
    let totalUpdated = 0;
    let lastDoc = null;

    try {
        while (true) {
            let query = db.collection('products').orderBy(admin.firestore.FieldPath.documentId()).limit(BATCH_SIZE);
            if (lastDoc) {
                query = query.startAfter(lastDoc);
            }

            const snapshot = await query.get();
            if (snapshot.empty) break;

            const batch = db.batch();
            let batchUpdated = 0;

            snapshot.docs.forEach(doc => {
                const productData = doc.data();
                const packaging = productData.packaging || "";
                
                const factor = getConversionFactor(packaging);

                // Chỉ cập nhật nếu conversionFactor chưa có hoặc giá trị khác
                if (productData.conversionFactor === undefined || productData.conversionFactor !== factor) {
                    batch.update(doc.ref, {
                        conversionFactor: factor
                    });
                    batchUpdated++;
                }
                lastDoc = doc; // Cập nhật con trỏ cho lần lặp tiếp theo
            });

            if (batchUpdated > 0) {
                await batch.commit();
                totalUpdated += batchUpdated;
                console.log(`[Batch thành công]: Đã cập nhật ${batchUpdated} sản phẩm. Tổng cộng: ${totalUpdated}`);
            } else {
                console.log(`[Batch thành công]: Không có thay đổi nào trong ${snapshot.size} sản phẩm.`);
            }

            if (snapshot.size < BATCH_SIZE) break; // Thoát nếu không còn đủ batch
        }
        
        console.log(`\n✅ HOÀN TẤT DI TRÚ. Tổng cộng đã cập nhật ${totalUpdated} sản phẩm.`);
        
    } catch (error) {
        console.error("\n❌ LỖI NGHIÊM TRỌNG KHI CHẠY SCRIPT:", error);
    }
}

// Chạy hàm chính
runMigration();