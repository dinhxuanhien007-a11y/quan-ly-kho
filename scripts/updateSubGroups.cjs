// File: updateSubGroups.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const MASTER_DATA_PATH = path.join(__dirname, 'master_data.csv');
const PRODUCTS_TO_UPDATE_PATH = path.join(__dirname, 'bd_products_to_update.csv');
const COLLECTION_NAME = 'products';
// --- KẾT THÚC CẤU HÌNH ---

console.log('--- Bắt đầu script cập nhật Phân loại (subGroup) ---');

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
async function updateProductSubGroups() {
    try {
        // 2. Đọc file master_data.csv để tạo map tra cứu
        console.log(`\n▶️ Đang đọc file master data: ${path.basename(MASTER_DATA_PATH)}...`);
        const subGroupMap = await readMasterData(MASTER_DATA_PATH);

        if (subGroupMap.size === 0) {
            console.error('\n❌ Lỗi: Không đọc được dữ liệu từ master_data.csv. Vui lòng kiểm tra lại file.');
            return;
        }
        console.log(`✔️ Đã đọc xong master data. Tìm thấy ${subGroupMap.size} mã hàng.`);

        // 3. Đọc file chứa danh sách sản phẩm cần cập nhật
        console.log(`\n▶️ Đang đọc danh sách sản phẩm cần cập nhật: ${path.basename(PRODUCTS_TO_UPDATE_PATH)}...`);
        const productIdsToUpdate = await readProductsToUpdate(PRODUCTS_TO_UPDATE_PATH);

        if (productIdsToUpdate.length === 0) {
            console.error('\n❌ Lỗi: Không đọc được danh sách sản phẩm cần cập nhật từ file bd_products_to_update.csv.');
            return;
        }
        console.log(`✔️ Đã đọc xong danh sách. Sẽ chỉ cập nhật ${productIdsToUpdate.length} sản phẩm này.`);

        // 4. Chuẩn bị và thực thi cập nhật hàng loạt (Batched Write)
        console.log('\n▶️ Bắt đầu quá trình cập nhật lên Firestore...');
        const batch = db.batch();
        let updateCount = 0;
        let notFoundCount = 0;

        for (const productId of productIdsToUpdate) {
            const newSubGroup = subGroupMap.get(productId);
            if (newSubGroup) {
                const productRef = db.collection(COLLECTION_NAME).doc(productId);
                batch.update(productRef, { subGroup: newSubGroup });
                updateCount++;
            } else {
                console.warn(`⚠️ Cảnh báo: Không tìm thấy thông tin subGroup cho mã hàng "${productId}" trong file master_data.csv. Bỏ qua...`);
                notFoundCount++;
            }
        }

        if (updateCount === 0) {
            console.log('\n⏹️ Không có sản phẩm nào hợp lệ để cập nhật. Kết thúc script.');
            return;
        }

        // 5. Gửi lô cập nhật lên Firestore
        await batch.commit();
        console.log('\n✅ CẬP NHẬT THÀNH CÔNG!');
        console.log(`   - ${updateCount} sản phẩm đã được cập nhật Phân loại (subGroup).`);
        if (notFoundCount > 0) {
            console.log(`   - ${notFoundCount} sản phẩm trong danh sách cập nhật không có trong master data.`);
        }

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
    }
}

// Hàm đọc file master_data.csv
function readMasterData(filePath) {
    return new Promise((resolve, reject) => {
        const map = new Map();
        fs.createReadStream(filePath, { encoding: 'utf8' })
            .pipe(csv({
                separator: ';',
                skipLines: 2
            }))
            .on('headers', (headers) => {
                console.log('Các cột tìm thấy trong master_data.csv:', headers);
            })
            .on('data', (row) => {
                const productId = row['Mã'];
                const subGroup = row['Nhóm VTHH'];
                if (productId && subGroup) {
                    map.set(productId.trim(), subGroup.trim());
                }
            })
            .on('end', () => resolve(map))
            .on('error', reject);
    });
}

// Hàm đọc file bd_products_to_update.csv (PHIÊN BẢN SỬA LỖI CUỐI CÙNG)
function readProductsToUpdate(filePath) {
    return new Promise((resolve, reject) => {
        const ids = [];
        fs.createReadStream(filePath, { encoding: 'utf8' })
            .pipe(csv({
                headers: false,
                separator: ';' // Vẫn giữ separator để xử lý đúng các dòng
            }))
            .on('data', (row) => {
                // Lấy dữ liệu từ cột đầu tiên
                let rawValue = row[0];

                // Bỏ qua nếu dòng rỗng hoặc không có giá trị
                if (!rawValue || rawValue.trim() === '') {
                    return;
                }
                
                // THAY ĐỔI QUAN TRỌNG:
                // 1. Chỉ lấy phần trước dấu phẩy (nếu có)
                // 2. Xóa tất cả dấu ngoặc kép (") ở bất cứ đâu trong chuỗi
                // 3. Xóa khoảng trắng thừa
                const productId = rawValue.split(',')[0].replace(/"/g, '').trim();

                // Lọc bỏ các giá trị không phải là mã hàng (như tiêu đề,...)
                const isLikelyHeader = /mã hàng|productid|column/i.test(productId);

                if (productId && !isLikelyHeader) {
                    ids.push(productId);
                }
            })
            .on('end', () => resolve(ids))
            .on('error', reject);
    });
}

// Chạy hàm chính
updateProductSubGroups();