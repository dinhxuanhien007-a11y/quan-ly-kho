// File: findMissingManufacturer.js
const path = require('path');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const COLLECTION_NAME = 'products';
// --- KẾT THÚC CẤU HÌNH ---

console.log(`--- Bắt đầu script tìm kiếm sản phẩm thiếu thông tin "Hãng sản xuất" ---`);

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
async function findMissingManufacturer() {
    try {
        // 2. Lấy toàn bộ sản phẩm từ collection
        console.log(`\n▶️ Đang truy vấn dữ liệu từ collection "${COLLECTION_NAME}"...`);
        const productsRef = db.collection(COLLECTION_NAME);
        const snapshot = await productsRef.get();

        if (snapshot.empty) {
            console.log('\n⏹️ Collection "products" bị trống. Không có gì để kiểm tra.');
            return;
        }

        console.log(`✔️ Đã lấy được ${snapshot.size} sản phẩm. Bắt đầu kiểm tra...`);

        const missingManufacturerList = [];

        // 3. Lặp qua từng sản phẩm để kiểm tra
        snapshot.forEach(doc => {
            const productData = doc.data();
            const manufacturer = productData.manufacturer;

            // Kiểm tra nếu trường 'manufacturer' không tồn tại, là null, hoặc là một chuỗi rỗng
            if (!manufacturer || manufacturer.trim() === '') {
                missingManufacturerList.push({
                    productId: doc.id,
                    productName: productData.productName || '(Không có tên)',
                    team: productData.team || 'N/A',
                    subGroup: productData.subGroup || 'N/A'
                });
            }
        });

        // 4. In kết quả
        if (missingManufacturerList.length === 0) {
            console.log('\n✅ TUYỆT VỜI! Tất cả sản phẩm đều đã có thông tin "Hãng sản xuất".');
        } else {
            console.warn(`\n⚠️ PHÁT HIỆN ${missingManufacturerList.length} SẢN PHẨM THIẾU THÔNG TIN "Hãng sản xuất":`);
            // In ra kết quả dưới dạng bảng cho dễ nhìn
            console.table(missingManufacturerList);
        }

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
    }
}

// Chạy hàm chính
findMissingManufacturer();