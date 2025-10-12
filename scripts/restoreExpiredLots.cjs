// File: restoreExpiredLots.js (Version 2 - Correct Logic)
const path = require('path');
const admin = require('firebase-admin');

// --- CẤU HÌNH ---
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const LOTS_COLLECTION = 'inventory_lots';
const EXPORTS_COLLECTION = 'export_tickets';
// --- KẾT THÚC CẤU HÌNH ---

console.log('--- Bắt đầu script KHÔI PHỤC số lượng chính xác cho các lô hàng đã hết HSD ---');

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
async function restoreQuantitiesCorrectly() {
    try {
        // 2. Tìm tất cả các lô hàng đã hết hạn VÀ có số lượng còn lại bằng 0
        console.log(`\n▶️ Bước 1: Tìm các lô hàng cần khôi phục trong "${LOTS_COLLECTION}"...`);
        const lotsRef = db.collection(LOTS_COLLECTION);
        const queryToFix = lotsRef
            .where('expiryDate', '<', new Date())
            .where('quantityRemaining', '==', 0);
        
        const snapshotToFix = await queryToFix.get();

        if (snapshotToFix.empty) {
            console.log('\n✅ Không tìm thấy lô hàng nào cần khôi phục. Dữ liệu có vẻ đã ổn.');
            return;
        }

        const lotsToFix = snapshotToFix.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`✔️ Đã tìm thấy ${lotsToFix.length} lô hàng cần tính toán và khôi phục.`);

        // 3. Tính tổng lượng đã xuất cho từng lô hàng
        console.log(`\n▶️ Bước 2: Tính toán tổng lượng hàng đã xuất từ collection "${EXPORTS_COLLECTION}"...`);
        const exportsRef = db.collection(EXPORTS_COLLECTION);
        const completedExportsQuery = exportsRef.where('status', '==', 'completed');
        const exportsSnapshot = await completedExportsQuery.get();

        const totalExportedByLot = new Map();
        exportsSnapshot.forEach(doc => {
            const items = doc.data().items || [];
            items.forEach(item => {
                if (item.lotId) {
                    const currentExported = totalExportedByLot.get(item.lotId) || 0;
                    const quantity = Number(item.quantityToExport || item.quantityExported || 0);
                    totalExportedByLot.set(item.lotId, currentExported + quantity);
                }
            });
        });
        console.log('✔️ Đã tổng hợp xong lịch sử xuất kho.');

        // 4. Chuẩn bị và thực thi cập nhật hàng loạt
        console.log('\n▶️ Bước 3: Chuẩn bị cập nhật hàng loạt...');
        const batch = db.batch();
        const restoredLotsInfo = [];

        for (const lot of lotsToFix) {
            const originalQuantity = lot.quantityImported || 0;
            const totalExported = totalExportedByLot.get(lot.id) || 0;
            
            // Tính toán số lượng tồn kho chính xác
            const correctRemaining = originalQuantity - totalExported;

            // Chỉ cập nhật nếu số lượng tính ra lớn hơn 0
            if (correctRemaining > 0) {
                const lotRef = db.collection(LOTS_COLLECTION).doc(lot.id);
                batch.update(lotRef, { 
                    quantityRemaining: correctRemaining, // Khôi phục lại số lượng ĐÚNG
                    isExpiredAndHandled: true           // Đánh dấu là đã xử lý
                });
                restoredLotsInfo.push({
                    productId: lot.productId,
                    lotNumber: lot.lotNumber,
                    'Tồn kho cũ': 0,
                    'Tồn kho mới (đã khôi phục)': correctRemaining
                });
            }
        }

        if (restoredLotsInfo.length === 0) {
            console.log('\n✅ Không có lô hàng nào cần khôi phục sau khi tính toán (có thể chúng đã được xuất hết).');
            return;
        }

        // 5. Gửi lô cập nhật lên Firestore
        await batch.commit();
        console.log(`\n✅ KHÔI PHỤC THÀNH CÔNG!`);
        console.log(`   - Đã khôi phục số lượng chính xác cho ${restoredLotsInfo.length} lô hàng.`);
        console.table(restoredLotsInfo);

    } catch (error) {
        console.error('\n❌ Đã xảy ra lỗi trong quá trình thực thi:', error);
    }
}

// Chạy hàm chính
restoreQuantitiesCorrectly();