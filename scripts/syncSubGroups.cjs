// File: syncSubGroups.js
const path = require('path');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const PRODUCTS_COLLECTION = 'products';
const LOTS_COLLECTION = 'inventory_lots';
// --- KẾT THÚC CẤU HÌNH ---

console.log('--- Bắt đầu script đồng bộ "subGroup" từ Products sang Inventory Lots ---');

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
async function syncSubGroupsToLots() {
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
        console.log(`✔️ Tìm thấy tổng cộng ${lotsSnapshot.size} lô hàng cần kiểm tra và cập nhật.`);

        // 4. Chuẩn bị và thực thi cập nhật hàng loạt (Batched Write)
        console.log('\n▶️ Bắt đầu quá trình đồng bộ dữ liệu...');
        
        const MAX_BATCH_SIZE = 490; // Giới hạn an toàn cho mỗi batch
        let batch = db.batch();
        let operationCount = 0;
        let totalUpdated = 0;
        let needsUpdate = false;

        for (let i = 0; i < lotsSnapshot.docs.length; i++) {
            const lotDoc = lotsSnapshot.docs[i];
            const lotData = lotDoc.data();
            const productId = lotData.productId;

            // Tìm subGroup tương ứng từ bản đồ đã tạo
            const newSubGroup = productSubGroupMap.get(productId);

            // Chỉ cập nhật nếu tìm thấy subGroup và nó khác với subGroup hiện tại của lô hàng
            if (newSubGroup && lotData.subGroup !== newSubGroup) {
                batch.update(lotDoc.ref, { subGroup: newSubGroup });
                operationCount++;
                totalUpdated++;
                needsUpdate = true;
            }

            // Khi batch đầy hoặc đã đến sản phẩm cuối cùng, thực thi batch
            if (operationCount === MAX_BATCH_SIZE || (i === lotsSnapshot.docs.length - 1 && needsUpdate)) {
                await batch.commit();
                console.log(`   - Đã cập nhật thành công ${operationCount} lô hàng.`);
                
                // Tạo batch mới cho lần lặp tiếp theo (nếu cần)
                batch = db.batch();
                operationCount = 0;
                needsUpdate = false;
            }
        }

        if (totalUpdated === 0) {
            console.log('\n✅ Dữ liệu "subGroup" trong các lô hàng đã được đồng bộ. Không cần cập nhật thêm.');
        } else {
            console.log('\n✅ ĐỒNG BỘ HOÀN TẤT!');
            console.log(`   - Tổng cộng ${totalUpdated} lô hàng đã được cập nhật trường "subGroup".`);
        }

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
    }
}

// Chạy hàm chính
syncSubGroupsToLots();