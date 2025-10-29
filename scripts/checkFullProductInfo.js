// File: scripts/checkFullProductInfo.js - Kiểm tra thông tin đầy đủ ở cả Products và Lots

const admin = require('firebase-admin');
// Đảm bảo file serviceAccountKey.json nằm ở vị trí đúng. 
// Nếu file key nằm ở thư mục gốc (D:\quan-ly-kho), hãy sửa lại thành: require('../serviceAccountKey.json')
const serviceAccount = require('./serviceAccountKey.json'); 

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Collections cần kiểm tra
const PRODUCTS_COLLECTION = 'products';
const LOTS_COLLECTION = 'inventory_lots'; 

// Danh sách các trường cần kiểm tra: team, nhiệt độ, hãng sản xuất, nhóm hàng
const FIELDS_TO_CHECK = ['team', 'storageTemp', 'manufacturer', 'subGroup']; 

/**
 * Hàm kiểm tra thông tin bị thiếu trong một collection cụ thể.
 * @param {string} collectionName - Tên collection để kiểm tra ('products' hoặc 'inventory_lots').
 * @param {Array<string>} fields - Mảng tên các trường cần kiểm tra.
 * @param {admin.firestore.Firestore} db - Đối tượng Firestore.
 */
async function checkMissingInfoInCollection(collectionName, fields, db) {
    console.log(`\nĐang kiểm tra collection: ${collectionName}...`);
    
    try {
        const snapshot = await db.collection(collectionName).get();
        let missingItems = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Lọc cục bộ: Kiểm tra nếu trường là null, undefined, hoặc chuỗi rỗng
            const missingFields = fields.filter(field => {
                const value = data[field];
                return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
            });

            if (missingFields.length > 0) {
                // Tùy chỉnh thông tin hiển thị theo cấp độ Product hay Lot
                let itemInfo = {
                    'ID (Firestore)': doc.id,
                    'Thiếu Trường': missingFields.join(', ')
                };
                
                if (collectionName === PRODUCTS_COLLECTION) {
                    itemInfo['Mã SP'] = data.productId || 'N/A';
                    itemInfo['Tên SP'] = data.productName || 'Không rõ';
                } else if (collectionName === LOTS_COLLECTION) {
                    itemInfo['Mã SP'] = data.productId || 'Không rõ';
                    itemInfo['Số Lô'] = data.lotNumber || 'N/A';
                }
                
                missingItems.push(itemInfo);
            }
        });

        // --- Báo cáo kết quả ---
        if (missingItems.length === 0) {
            console.log(`✅ Hoàn tất: Không tìm thấy tài liệu nào trong ${collectionName} bị thiếu thông tin.`);
        } else {
            console.log(`\n❌ CẢNH BÁO: Tìm thấy ${missingItems.length} tài liệu trong ${collectionName} thiếu thông tin:`);
            console.table(missingItems);
            console.log(`\n-> Vui lòng cập nhật các trường này trong collection '${collectionName}'.`);
        }
        return missingItems.length;

    } catch (error) {
        console.error(`\n❌ LỖI NGHIÊM TRỌNG khi kiểm tra ${collectionName}: ${error.message}`);
        return 0;
    }
}

/**
 * Hàm chính để điều phối việc kiểm tra.
 */
async function checkMissingData() {
    console.log(`\n================================================================`);
    console.log(`| BẮT ĐẦU KIỂM TRA THÔNG TIN TEAM, TEMP, MFG, SUBGROUP TOÀN DIỆN |`);
    console.log(`================================================================\n`);
    
    let totalMissing = 0;
    
    totalMissing += await checkMissingInfoInCollection(PRODUCTS_COLLECTION, FIELDS_TO_CHECK, db);
    console.log('\n----------------------------------------------------------------');
    totalMissing += await checkMissingInfoInCollection(LOTS_COLLECTION, FIELDS_TO_CHECK, db);

    console.log(`\n================================================================`);
    console.log(`| TỔNG KẾT: Tìm thấy ${totalMissing} lỗi thiếu thông tin |`);
    console.log(`================================================================\n`);
    process.exit(0);
}

// Chạy hàm chính
checkMissingData();