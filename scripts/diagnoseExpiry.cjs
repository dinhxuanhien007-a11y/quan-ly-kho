// File: diagnoseExpiry.js
const path = require('path');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const PRODUCTS_COLLECTION = 'products';
const LOTS_COLLECTION = 'inventory_lots';
const SUMMARIES_COLLECTION = 'product_summaries';
// --- KẾT THÚC CẤU HÌNH ---

console.log('--- Bắt đầu script chẩn đoán dữ liệu HSD ---');

// 1. Khởi tạo Firebase Admin
try {
    const serviceAccount = require(SERVICE_ACCOUNT_KEY_PATH);
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    console.log('✅ Khởi tạo Firebase Admin thành công.');
} catch (error) {
    console.error('❌ Lỗi nghiêm trọng: Không tìm thấy hoặc file serviceAccountKey.json không hợp lệ.');
    process.exit(1);
}

const db = admin.firestore();

// Hàm chuyển đổi Timestamp sang định dạng dd/mm/yyyy
const formatDate = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'N/A';
    return timestamp.toDate().toLocaleDateString('vi-VN');
};

// Hàm chính để chạy script
async function diagnoseExpiryData() {
    try {
        // 2. Tìm tất cả các lô hàng đã hết hạn và còn tồn kho
        console.log(`\n▶️ Bước 1: Tìm các lô hàng thực sự đã hết hạn trong "${LOTS_COLLECTION}"...`);
        const lotsRef = db.collection(LOTS_COLLECTION);
        const expiredLotsQuery = lotsRef
            .where('expiryDate', '<', new Date())
            .where('quantityRemaining', '>', 0);
        
        const expiredLotsSnapshot = await expiredLotsQuery.get();

        if (expiredLotsSnapshot.empty) {
            console.log('\n✅ KIỂM TRA HOÀN TẤT: Không tìm thấy lô hàng nào đã hết hạn mà vẫn còn tồn kho. Dữ liệu của bạn có vẻ chính xác.');
            return;
        }
        
        const expiredLots = expiredLotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`✔️ Đã tìm thấy ${expiredLots.length} lô hàng đã hết hạn và còn tồn kho.`);
        
        const productIdsWithExpiredLots = [...new Set(expiredLots.map(lot => lot.productId))];

        // 3. Kiểm tra các document tương ứng trong product_summaries
        console.log(`\n▶️ Bước 2: Kiểm tra chéo với collection "${SUMMARIES_COLLECTION}"...`);
        
        const summariesRef = db.collection(SUMMARIES_COLLECTION);
        const summariesSnapshot = await summariesRef.where(admin.firestore.FieldPath.documentId(), 'in', productIdsWithExpiredLots).get();

        const summariesMap = new Map();
        summariesSnapshot.forEach(doc => {
            summariesMap.set(doc.id, doc.data());
        });

        const discrepancies = [];

        for (const productId of productIdsWithExpiredLots) {
            const summaryData = summariesMap.get(productId);
            const nearestExpiredLot = expiredLots
                .filter(lot => lot.productId === productId)
                .sort((a, b) => a.expiryDate.toMillis() - b.expiryDate.toMillis())[0]; // Tìm HSD cũ nhất

            const nearestExpiryDateInSummary = summaryData ? summaryData.nearestExpiryDate : null;

            // Nếu HSD trong summary là null hoặc là một ngày trong tương lai -> Báo lỗi
            if (!nearestExpiryDateInSummary || nearestExpiryDateInSummary.toMillis() > new Date().getTime()) {
                discrepancies.push({
                    productId: productId,
                    'HSD Lô Hết Hạn (Thực tế)': formatDate(nearestExpiredLot.expiryDate),
                    'HSD Gần Nhất (Trong Summary)': formatDate(nearestExpiryDateInSummary),
                    'Ghi chú': 'Dữ liệu trong Summary BỊ SAI. Cần được cập nhật lại.'
                });
            }
        }
        
        // 4. In kết quả
        if (discrepancies.length === 0) {
            console.log('\n✅ KIỂM TRA HOÀN TẤT: Dữ liệu "nearestExpiryDate" trong "product_summaries" có vẻ chính xác. Vấn đề có thể phức tạp hơn.');
        } else {
            console.warn(`\n⚠️ PHÁT HIỆN ${discrepancies.length} SẢN PHẨM CÓ DỮ LIỆU HSD BỊ LỆCH:`);
            console.table(discrepancies);
            console.warn('\n💡 Kết luận: Dữ liệu trong collection "product_summaries" của bạn đã lỗi thời. Điều này giải thích tại sao bộ lọc không hoạt động. Bạn cần chạy một script để đồng bộ lại dữ liệu này.');
        }

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
    }
}

// Chạy hàm chính
diagnoseExpiryData();