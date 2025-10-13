// D:\quan-ly-kho\scripts\recalculateAllocations.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// This line securely loads your key file
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();

async function recalculateAllocations() {
    console.log("🚀 Bắt đầu quá trình tính toán lại số lượng đặt giữ...");

    try {
        let initialBatch = db.batch();
        const lotsRef = db.collection('inventory_lots');
        const lotsSnap = await lotsRef.get();

        // Step 1: Reset all allocations to 0
        console.log(`- Tìm thấy ${lotsSnap.size} lô. Đang reset quantityAllocated về 0...`);
        lotsSnap.forEach(lotDoc => {
            initialBatch.update(lotDoc.ref, { quantityAllocated: 0 });
        });
        await initialBatch.commit();
        console.log("- ✅ Đã reset thành công.");

        // Step 2: Recalculate from "pending" export slips
        const newAllocations = new Map();
        const pendingExportsQuery = db.collection('export_tickets').where('status', '==', 'pending');
        const pendingExportsSnap = await pendingExportsQuery.get();

        console.log(`- Tìm thấy ${pendingExportsSnap.size} phiếu xuất nháp. Đang tính toán lại...`);
        pendingExportsSnap.forEach(slipDoc => {
            const items = slipDoc.data().items || [];
            items.forEach(item => {
                if (item.lotId) {
                    const current = newAllocations.get(item.lotId) || 0;
                    newAllocations.set(item.lotId, current + Number(item.quantityToExport || item.quantityExported || 0));
                }
            });
        });

        // Step 3: Commit the correct values
        if (newAllocations.size > 0) {
            const updateBatch = db.batch();
            console.log(`- Chuẩn bị cập nhật lại ${newAllocations.size} lô hàng...`);
            for (const [lotId, totalAllocated] of newAllocations.entries()) {
                console.log(`  - Lô ${lotId} -> đặt giữ: ${totalAllocated}`);
                const lotRef = db.collection('inventory_lots').doc(lotId);
                updateBatch.update(lotRef, { quantityAllocated: totalAllocated });
            }
            await updateBatch.commit();
            console.log("- ✅ Đã cập nhật lại số lượng đặt giữ thành công!");
        }

        console.log("\n🎉 HOÀN TẤT! Dữ liệu tồn kho đặt giữ đã được đồng bộ.");

    } catch (error) {
        console.error("\n❌ Đã xảy ra lỗi nghiêm trọng:", error);
    }
}

recalculateAllocations();