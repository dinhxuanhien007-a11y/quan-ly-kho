// File: syncSubGroupToSummaries.js
const path = require('path');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const PRODUCTS_COLLECTION = 'products';
const SUMMARIES_COLLECTION = 'product_summaries';
// --- KẾT THÚC CẤU HÌNH ---

console.log(`--- Bắt đầu script đồng bộ "subGroup" từ "${PRODUCTS_COLLECTION}" sang "${SUMMARIES_COLLECTION}" ---`);

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
async function syncSubGroupToSummaries() {
    try {
        // 2. Đọc 'products' để tạo map tra cứu
        console.log(`\n▶️ Đang đọc dữ liệu gốc từ collection "${PRODUCTS_COLLECTION}"...`);
        const productsSnapshot = await db.collection(PRODUCTS_COLLECTION).get();
        
        const productSubGroupMap = new Map();
        productsSnapshot.forEach(doc => {
            const productData = doc.data();
            productSubGroupMap.set(doc.id, productData.subGroup || null);
        });

        if (productSubGroupMap.size === 0) {
            console.error(`\n❌ Lỗi: Collection "${PRODUCTS_COLLECTION}" trống.`);
            return;
        }
        console.log(`✔️ Đã tạo bản đồ tra cứu cho ${productSubGroupMap.size} sản phẩm.`);

        // 3. Lấy toàn bộ các document trong 'product_summaries'
        console.log(`\n▶️ Đang lấy danh sách các bản ghi tổng hợp từ "${SUMMARIES_COLLECTION}"...`);
        const summariesSnapshot = await db.collection(SUMMARIES_COLLECTION).get();

        if (summariesSnapshot.empty) {
            console.log(`\n⏹️ Collection "${SUMMARIES_COLLECTION}" trống. Không có gì để đồng bộ.`);
            return;
        }
        console.log(`✔️ Tìm thấy tổng cộng ${summariesSnapshot.size} bản ghi tổng hợp cần kiểm tra.`);

        // 4. Chuẩn bị và thực thi cập nhật hàng loạt
        console.log('\n▶️ Bắt đầu quá trình đồng bộ dữ liệu...');
        
        const MAX_BATCH_SIZE = 490;
        let batch = db.batch();
        let operationCount = 0;
        let totalUpdated = 0;

        for (let i = 0; i < summariesSnapshot.docs.length; i++) {
            const summaryDoc = summariesSnapshot.docs[i];
            const summaryData = summaryDoc.data();
            const productId = summaryDoc.id;

            const correctSubGroup = productSubGroupMap.get(productId);

            // Chỉ cập nhật nếu subGroup bị sai lệch hoặc chưa có
            if (correctSubGroup !== undefined && summaryData.subGroup !== correctSubGroup) {
                batch.update(summaryDoc.ref, { subGroup: correctSubGroup || "" });
                operationCount++;
                totalUpdated++;
            }

            if (operationCount === MAX_BATCH_SIZE || (i === summariesSnapshot.docs.length - 1 && operationCount > 0)) {
                await batch.commit();
                console.log(`   - Đã cập nhật thành công ${operationCount} bản ghi.`);
                batch = db.batch();
                operationCount = 0;
            }
        }

        if (totalUpdated === 0) {
            console.log('\n✅ Dữ liệu "subGroup" trong các bản ghi tổng hợp đã được đồng bộ. Không cần cập nhật thêm.');
        } else {
            console.log('\n✅ ĐỒNG BỘ HOÀN TẤT!');
            console.log(`   - Tổng cộng ${totalUpdated} bản ghi tổng hợp đã được cập nhật trường "subGroup".`);
        }

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
    }
}

// Chạy hàm chính
syncSubGroupToSummaries();