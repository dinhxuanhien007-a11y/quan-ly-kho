// File: findKhac.js
const path = require('path');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const COLLECTION_NAME = 'products';
const SUBGROUP_TO_FIND = 'KHÁC';
// --- KẾT THÚC CẤU HÌNH ---

console.log(`--- Bắt đầu script tìm kiếm sản phẩm có subGroup là "${SUBGROUP_TO_FIND}" ---`);

// 1. Khởi tạo Firebase Admin
try {
    const serviceAccount = require(SERVICE_ACCOUNT_KEY_PATH);
    // Kiểm tra xem app đã được khởi tạo chưa để tránh lỗi
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
async function findProductsBySubGroup() {
    try {
        // 2. Tìm tất cả sản phẩm có subGroup trùng khớp
        console.log(`\n▶️ Đang truy vấn các sản phẩm trong collection "${COLLECTION_NAME}"...`);
        const productsRef = db.collection(COLLECTION_NAME);
        const q = productsRef.where('subGroup', '==', SUBGROUP_TO_FIND);
        
        const snapshot = await q.get();

        if (snapshot.empty) {
            console.log(`\n✅ Không tìm thấy sản phẩm nào có subGroup là "${SUBGROUP_TO_FIND}".`);
            return;
        }

        const foundProducts = snapshot.docs.map(doc => ({
            productId: doc.id,
            productName: doc.data().productName || '(Không có tên)',
            currentSubGroup: doc.data().subGroup
        }));
        
        console.log(`\n✅ Đã tìm thấy ${foundProducts.length} sản phẩm có subGroup là "${SUBGROUP_TO_FIND}":`);
        
        // In ra kết quả dưới dạng bảng cho dễ nhìn
        console.table(foundProducts);

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
        // Gợi ý nếu lỗi liên quan đến index
        if (error.message.includes('requires an index')) {
            console.error('\n💡 Gợi ý: Lỗi này thường do bạn chưa tạo chỉ mục (index) trong Firestore. Vui lòng truy cập vào đường link trong thông báo lỗi (nếu có) để tạo chỉ mục tự động, sau đó chờ vài phút và chạy lại script.');
        }
    }
}

// Chạy hàm chính
findProductsBySubGroup();