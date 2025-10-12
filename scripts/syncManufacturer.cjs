// File: syncManufacturer.js
const path = require('path');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const PRODUCTS_COLLECTION = 'products';
const LOTS_COLLECTION = 'inventory_lots';
// --- KẾT THÚC CẤU HÌNH ---

console.log('--- Bắt đầu script đồng bộ "Hãng sản xuất" từ Products sang Inventory Lots ---');

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

// Hàm chính để chạy script
async function syncManufacturerToLots() {
    try {
        // 2. Đọc toàn bộ collection 'products' để tạo bản đồ tra cứu
        console.log(`\n▶️ Đang đọc dữ liệu gốc từ collection "${PRODUCTS_COLLECTION}"...`);
        const productsSnapshot = await db.collection(PRODUCTS_COLLECTION).get();
        
        const productManufacturerMap = new Map();
        productsSnapshot.forEach(doc => {
            const productData = doc.data();
            if (productData.manufacturer) {
                productManufacturerMap.set(doc.id, productData.manufacturer);
            }
        });

        if (productManufacturerMap.size === 0) {
            console.error('\n❌ Lỗi: Không tìm thấy sản phẩm nào có trường "manufacturer" trong collection "products".');
            return;
        }
        console.log(`✔️ Đã tạo bản đồ tra cứu cho ${productManufacturerMap.size} sản phẩm.`);

        // 3. Lấy toàn bộ các lô hàng trong 'inventory_lots'
        console.log(`\n▶️ Đang lấy danh sách tất cả các lô hàng từ collection "${LOTS_COLLECTION}"...`);
        const lotsSnapshot = await db.collection(LOTS_COLLECTION).get();

        if (lotsSnapshot.empty) {
            console.log('\n⏹️ Không tìm thấy lô hàng nào trong kho. Kết thúc script.');
            return;
        }
        console.log(`✔️ Tìm thấy tổng cộng ${lotsSnapshot.size} lô hàng cần kiểm tra và cập nhật.`);

        // 4. Chuẩn bị và thực thi cập nhật hàng loạt
        console.log('\n▶️ Bắt đầu quá trình đồng bộ dữ liệu...');
        
        const MAX_BATCH_SIZE = 490;
        let batch = db.batch();
        let operationCount = 0;
        let totalUpdated = 0;

        for (let i = 0; i < lotsSnapshot.docs.length; i++) {
            const lotDoc = lotsSnapshot.docs[i];
            const lotData = lotDoc.data();
            const productId = lotData.productId;

            const correctManufacturer = productManufacturerMap.get(productId);

            // Chỉ cập nhật nếu tìm thấy thông tin và nó khác với thông tin hiện tại
            if (correctManufacturer && lotData.manufacturer !== correctManufacturer) {
                batch.update(lotDoc.ref, { manufacturer: correctManufacturer });
                operationCount++;
                totalUpdated++;
            }

            if (operationCount === MAX_BATCH_SIZE || (i === lotsSnapshot.docs.length - 1 && operationCount > 0)) {
                await batch.commit();
                console.log(`   - Đã cập nhật thành công ${operationCount} lô hàng.`);
                batch = db.batch();
                operationCount = 0;
            }
        }

        if (totalUpdated === 0) {
            console.log('\n✅ Dữ liệu "Hãng sản xuất" trong các lô hàng đã được đồng bộ. Không cần cập nhật thêm.');
        } else {
            console.log('\n✅ ĐỒNG BỘ HOÀN TẤT!');
            console.log(`   - Tổng cộng ${totalUpdated} lô hàng đã được cập nhật trường "manufacturer".`);
        }

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
    }
}

// Chạy hàm chính
syncManufacturerToLots();