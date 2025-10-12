// File: verifySubGroups.js
const path = require('path');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const PRODUCTS_COLLECTION = 'products';
const LOTS_COLLECTION = 'inventory_lots';
// --- KẾT THÚC CẤU HÌNH ---

console.log('--- Bắt đầu script KIỂM TRA sự đồng bộ "subGroup" ---');

// 1. Khởi tạo Firebase Admin
try {
    const serviceAccount = require(SERVICE_ACCOUNT_KEY_PATH);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Khởi tạo Firebase Admin thành công.');
} catch (error) {
    console.error('❌ Lỗi nghiêm trọng: Không tìm thấy hoặc file serviceAccountKey.json không hợp lệ.');
    process.exit(1);
}

const db = admin.firestore();

// Hàm chính để chạy script
async function verifySubGroups() {
    try {
        // 2. Đọc toàn bộ collection 'products' để tạo bản đồ tra cứu
        console.log(`\n▶️ Đang đọc dữ liệu gốc từ collection "${PRODUCTS_COLLECTION}"...`);
        const productsSnapshot = await db.collection(PRODUCTS_COLLECTION).get();
        
        const productSubGroupMap = new Map();
        productsSnapshot.forEach(doc => {
            const productData = doc.data();
            if (productData.subGroup) {
                productSubGroupMap.set(doc.id, productData.subGroup);
            }
        });

        if (productSubGroupMap.size === 0) {
            console.error('\n❌ Lỗi: Không tìm thấy sản phẩm nào có trường "subGroup" trong collection "products".');
            return;
        }
        console.log(`✔️ Đã tạo bản đồ tra cứu cho ${productSubGroupMap.size} sản phẩm.`);

        // 3. Lấy toàn bộ các lô hàng trong 'inventory_lots'
        console.log(`\n▶️ Đang lấy danh sách tất cả các lô hàng từ collection "${LOTS_COLLECTION}"...`);
        const lotsSnapshot = await db.collection(LOTS_COLLECTION).get();

        if (lotsSnapshot.empty) {
            console.log('\n⏹️ Không tìm thấy lô hàng nào trong kho. Kết thúc script.');
            return;
        }
        console.log(`✔️ Tìm thấy tổng cộng ${lotsSnapshot.size} lô hàng để kiểm tra.`);

        // 4. Bắt đầu quá trình kiểm tra và báo cáo
        console.log('\n▶️ Bắt đầu so sánh dữ liệu...');
        
        const discrepancies = [];

        for (const lotDoc of lotsSnapshot.docs) {
            const lotData = lotDoc.data();
            const lotId = lotDoc.id;
            const productId = lotData.productId;
            const currentSubGroup = lotData.subGroup;

            // Tìm subGroup chính xác từ bản đồ
            const correctSubGroup = productSubGroupMap.get(productId);

            // So sánh
            if (correctSubGroup && currentSubGroup !== correctSubGroup) {
                discrepancies.push({
                    lotId: lotId,
                    productId: productId,
                    lotNumber: lotData.lotNumber || '(Không có)',
                    currentSubGroup: currentSubGroup || '(Trống)',
                    correctSubGroup: correctSubGroup
                });
            } else if (!correctSubGroup && currentSubGroup) {
                // Trường hợp lô hàng có subGroup nhưng sản phẩm gốc lại không có
                 discrepancies.push({
                    lotId: lotId,
                    productId: productId,
                    lotNumber: lotData.lotNumber || '(Không có)',
                    currentSubGroup: currentSubGroup,
                    correctSubGroup: '(Sản phẩm gốc không có subGroup)'
                });
            }
        }

        // 5. In kết quả
        if (discrepancies.length === 0) {
            console.log('\n✅ TUYỆT VỜI! Tất cả lô hàng đều có thông tin "subGroup" chính xác.');
        } else {
            console.warn(`\n⚠️ PHÁT HIỆN ${discrepancies.length} LÔ HÀNG CÓ THÔNG TIN "subGroup" BỊ SAI LỆCH:`);
            console.table(discrepancies);
            console.warn('\n💡 Gợi ý: Bạn có thể chạy lại script "syncSubGroups.js" để khắc phục các sai lệch này.');
        }

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
    }
}

// Chạy hàm chính
verifySubGroups();