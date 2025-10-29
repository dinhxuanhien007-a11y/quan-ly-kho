// File: scripts/fixMissingLotInfo.js - Sửa lỗi dữ liệu bị thiếu trong inventory_lots (Đã thêm diagnostic)

const admin = require('firebase-admin');
// Đảm bảo đường dẫn tới key là chính xác
const serviceAccount = require('./serviceAccountKey.json'); 

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const PRODUCTS_COLLECTION = 'products';
const LOTS_COLLECTION = 'inventory_lots'; 

const FIELD_TO_FIX = 'subGroup'; 

/**
 * Hàm chính để quét, tra cứu và cập nhật dữ liệu.
 */
async function fixMissingSubGroupData() {
    console.log(`\n================================================================`);
    console.log(`| BẮT ĐẦU QUÁ TRÌNH SỬA LỖI TỰ ĐỘNG FIELD: ${FIELD_TO_FIX} |`);
    console.log(`================================================================\n`);
    
    let lotsToFix = [];
    
    try {
        // 1. Tải TOÀN BỘ collection Lots và lọc cục bộ các lô hàng bị thiếu 'subGroup'
        const snapshot = await db.collection(LOTS_COLLECTION).get();
        
        lotsToFix = snapshot.docs.map(doc => ({
            id: doc.id,
            productId: doc.data().productId,
            lotNumber: doc.data().lotNumber,
            data: doc.data()
        })).filter(lot => {
            const value = lot.data[FIELD_TO_FIX];
            return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
        });

        if (lotsToFix.length === 0) {
            console.log(`✅ Tuyệt vời! Không tìm thấy lô hàng nào bị thiếu trường '${FIELD_TO_FIX}'.`);
            return;
        }

        console.log(`Đã tìm thấy ${lotsToFix.length} lô hàng cần sửa lỗi (Missing ${FIELD_TO_FIX}).`);

    } catch (error) {
        console.error("LỖI KHI TẢI VÀ LỌC LÔ HÀNG THIẾU:", error.message);
        return;
    }

    // 2. Tra cứu thông tin 'subGroup' từ collection 'products'
    const productIds = [...new Set(lotsToFix.map(lot => lot.productId))];
    const productsMap = new Map(); 
    
    if (productIds.length > 0) {
        console.log(`\nĐang tra cứu thông tin Sản phẩm cho ${productIds.length} Mã SP khác nhau...`);
        
        const productsSnapshot = await db.collection(PRODUCTS_COLLECTION).get();
        productsSnapshot.forEach(doc => {
            const data = doc.data();
            // LƯU Ý: Phải đảm bảo 'productId' trong products được dùng làm key trong map
            // Chúng ta ép buộc tất cả productId về chuỗi để loại trừ lỗi định dạng
            if (data.productId) { 
                const standardizedProductId = String(data.productId).trim();
                productsMap.set(standardizedProductId, data[FIELD_TO_FIX]);
            }
        });
    }

    // 3. Thực hiện cập nhật lô hàng với logic kiểm tra mạnh mẽ hơn
    console.log(`\nBắt đầu cập nhật ${lotsToFix.length} lô hàng...`);
    
    const batch = db.batch();
    let fixedCount = 0;
    
    lotsToFix.forEach(lot => {
        // Ép buộc productId của lô hàng về chuỗi để khớp với productsMap
        const lotProductIdKey = String(lot.productId).trim(); 
        
        const productSubGroup = productsMap.get(lotProductIdKey);
        
        // Logic kiểm tra mới: Chỉ cần tồn tại (không null/undefined)
        const existsInProduct = productSubGroup !== undefined && productSubGroup !== null; 

        if (existsInProduct) { 
            // Ép buộc giá trị về dạng String và trim để chuẩn hóa
            const standardizedSubGroup = String(productSubGroup).trim(); 
            
            // Kiểm tra lần cuối: đảm bảo giá trị sau khi chuẩn hóa không rỗng.
            if (standardizedSubGroup.length > 0) {
                const lotRef = db.collection(LOTS_COLLECTION).doc(lot.id);
                
                const updateData = {
                    [FIELD_TO_FIX]: standardizedSubGroup
                };
                
                batch.update(lotRef, updateData);
                fixedCount++;
            } else {
                console.warn(`[LỖI DỮ LIỆU GỐC]: Lô ${lot.lotNumber} (Mã SP: ${lot.productId}) không thể sửa vì 'subGroup' trong Sản phẩm gốc là chuỗi rỗng sau khi chuẩn hóa.`);
            }
        } else {
            // Trường hợp lỗi KEY hoặc Mã SP không tồn tại
            console.error(`[LỖI KEY/KHÔNG TỒN TẠI] 🚨: Lô ${lot.lotNumber} (Mã SP: ${lot.productId}) không tìm thấy trong productsMap.`);
            console.error(`-> KIỂM TRA: Mã SP '${lot.productId}' có tồn tại chính xác trong collection 'products' không?`);
        }
    });

    if (fixedCount > 0) {
        await batch.commit();
        console.log(`\n✅ HOÀN TẤT! Đã cập nhật thành công ${fixedCount} lô hàng bị thiếu '${FIELD_TO_FIX}'.`);
    } else {
        console.log("Không có lô hàng nào được sửa. Vui lòng kiểm tra lỗi KEY được báo cáo.");
    }
}

// Chạy hàm chính
fixMissingSubGroupData();