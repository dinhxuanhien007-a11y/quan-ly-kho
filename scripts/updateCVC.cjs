// File: updateCVC.js
const path = require('path');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const COLLECTION_NAME = 'products';
const MANUFACTURER_TO_FIND = 'Intra Special Catheters';
const NEW_SUBGROUP = 'CVC';
// --- KẾT THÚC CẤU HÌNH ---

console.log(`--- Bắt đầu script cập nhật nhóm hàng cho hãng sản xuất: "${MANUFACTURER_TO_FIND}" ---`);

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
async function updateProductsByManufacturer() {
    try {
        // 2. Tìm tất cả sản phẩm có hãng sản xuất trùng khớp
        console.log(`\n▶️ Đang tìm kiếm các sản phẩm có hãng sản xuất là "${MANUFACTURER_TO_FIND}"...`);
        const productsRef = db.collection(COLLECTION_NAME);
        const q = productsRef.where('manufacturer', '==', MANUFACTURER_TO_FIND);
        
        const snapshot = await q.get();

        if (snapshot.empty) {
            console.log('\n⏹️ Không tìm thấy sản phẩm nào phù hợp. Không có gì để cập nhật. Kết thúc script.');
            return;
        }

        const productsToUpdate = snapshot.docs;
        console.log(`✔️ Đã tìm thấy ${productsToUpdate.length} sản phẩm phù hợp.`);

        // 3. Chuẩn bị và thực thi cập nhật hàng loạt (Batched Write)
        console.log(`\n▶️ Bắt đầu quá trình cập nhật trường "subGroup" thành "${NEW_SUBGROUP}"...`);
        
        // Firestore giới hạn 500 thao tác cho mỗi batch
        const MAX_BATCH_SIZE = 500;
        let batch = db.batch();
        let operationCount = 0;
        let totalUpdated = 0;

        for (let i = 0; i < productsToUpdate.length; i++) {
            const productDoc = productsToUpdate[i];
            batch.update(productDoc.ref, { subGroup: NEW_SUBGROUP });
            operationCount++;

            // Khi batch đầy hoặc đã đến sản phẩm cuối cùng, thực thi batch
            if (operationCount === MAX_BATCH_SIZE || i === productsToUpdate.length - 1) {
                await batch.commit();
                console.log(`   - Đã cập nhật thành công ${operationCount} sản phẩm.`);
                totalUpdated += operationCount;

                // Tạo batch mới cho lần lặp tiếp theo (nếu cần)
                batch = db.batch();
                operationCount = 0;
            }
        }

        console.log('\n✅ CẬP NHẬT HOÀN TẤT!');
        console.log(`   - Tổng cộng ${totalUpdated} sản phẩm đã được cập nhật.`);

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
        // Gợi ý nếu lỗi liên quan đến index
        if (error.message.includes('requires an index')) {
            console.error('\n💡 Gợi ý: Lỗi này thường do bạn chưa tạo chỉ mục (index) trong Firestore. Vui lòng truy cập vào đường link trong thông báo lỗi (nếu có) để tạo chỉ mục tự động, sau đó chờ vài phút và chạy lại script.');
        }
    }
}

// Chạy hàm chính
updateProductsByManufacturer();