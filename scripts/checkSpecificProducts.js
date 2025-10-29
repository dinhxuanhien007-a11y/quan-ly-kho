// File: scripts/checkSpecificProducts.js - Chỉ kiểm tra các Mã SP bị nghi ngờ

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); 

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const PRODUCTS_COLLECTION = 'products';
const FIELD_TO_CHECK = 'subGroup'; 

// Chia danh sách 32 Mã SP thành các nhóm nhỏ (mỗi nhóm <= 10)
const PRODUCT_ID_CHUNKS = [
    ['364606', '306574', '556577', '367884', '441772', '364815', '320566', '8803-03', '215348', '349700'],
    ['349703', '442841', '215351', '326674', '5476-04', '368872', '5514E', '448008', '442946', '449027'],
    ['245116', '448614', '8703-04', '442017', '391891', '367896', '367812', '367281', '340991', '442840'],
    ['360213', '215350']
];

async function checkSpecificProducts() {
    console.log(`\n================================================================`);
    console.log(`| BẮT ĐẦU KIỂM TRA SẢN PHẨM GỐC CHO ${FIELD_TO_CHECK} |`);
    console.log(`================================================================\n`);

    let missingCount = 0;

    for (const chunk of PRODUCT_ID_CHUNKS) {
        try {
            const queryRef = db.collection(PRODUCTS_COLLECTION)
                .where('productId', 'in', chunk);
            
            const snapshot = await queryRef.get();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const subGroupValue = data[FIELD_TO_CHECK];
                
                if (subGroupValue === null || subGroupValue === undefined || (typeof subGroupValue === 'string' && subGroupValue.trim() === '')) {
                    console.log(`❌ SẢN PHẨM GỐC LỖI: Mã SP ${data.productId} (ID: ${doc.id}) đang thiếu trường ${FIELD_TO_CHECK}.`);
                    missingCount++;
                }
            });
            
        } catch (error) {
            console.error(`\n❌ LỖI TRUY VẤN CHUNKS: ${error.message}`);
        }
    }

    console.log(`\n================================================================`);
    if (missingCount > 0) {
        console.warn(`⚠️ TỔNG KẾT: Tìm thấy ${missingCount} Sản phẩm gốc bị thiếu thông tin.`);
        console.log("-> BẠN PHẢI CẬP NHẬT TRƯỜNG 'subGroup' CHO CÁC SẢN PHẨM NÀY TRONG COLLECTION 'products' TRƯỚC.");
    } else {
        console.log(`✅ TỔNG KẾT: Không tìm thấy Sản phẩm gốc nào bị thiếu thông tin.`);
    }
    console.log(`================================================================\n`);
    process.exit(0);
}

checkSpecificProducts();