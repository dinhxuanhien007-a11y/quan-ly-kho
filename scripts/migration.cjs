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

/**
 * Phân tích chuỗi quy cách để tìm ra TỶ LỆ QUY ĐỔI AN TOÀN.
 * Hàm này cần phải giống hệt hàm trong Cloud Functions để đảm bảo tính nhất quán.
 */
function getConversionFactor(packagingStr) {
    if (!packagingStr || packagingStr.toUpperCase() === "N/A") return 1;

    // 1. Loại bỏ các ký tự phi số (trừ dấu chấm và dấu /) và chuẩn hóa khoảng trắng
    // Chuỗi mẫu: "4.5 mL/ Lọ, 100 Lọ/ Hộp" -> "4.5/100/100" (Nếu có nhiều số)
    let cleanedStr = packagingStr
        .replace(/,/g, ' ') 
        .replace(/x/g, '/') // Thay 'x' bằng '/'
        .replace(/[a-zA-Z]/g, ' ') // Xóa chữ cái (mL, Lọ, Hộp, etc.)
        .replace(/[^0-9\/\.]/g, ' ') // Thay thế ký tự lạ bằng khoảng trắng
        .replace(/\s+/g, ' ')
        .trim();
        
    // 2. Tìm TẤT CẢ các cặp số (tách bởi khoảng trắng)
    const allNumbers = cleanedStr.match(/(\d+(\.\d+)?)/g);
    
    if (allNumbers && allNumbers.length > 0) {
        let bestFactor = 1;
        
        // 3. DUYỆT TẤT CẢ CÁC SỐ VÀ CHỌN SỐ LƯỢNG LỚN NHẤT > 1
        allNumbers.forEach(numStr => {
            const factor = Math.round(Number(numStr));
            if (factor > bestFactor) {
                bestFactor = factor;
            }
        });
        
        // Tránh trường hợp chỉ có 1 hoặc 0.x (ví dụ: 0.25 mg/ Lọ)
        // Nếu số lớn nhất là 1, ta nên giữ nguyên 1.
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