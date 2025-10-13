// D:\quan-ly-kho\scripts\revertDatesToNull.js

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

// Tải file service account key
const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

// Khởi tạo Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();
// Đây là ngày tháng chính xác mà script trước đã sử dụng để cập nhật
const SENTINEL_DATE = new Date('9999-12-31T00:00:00.000Z');

async function revertSentinelDatesToNull() {
    console.log("🚀 Bắt đầu quá trình hoàn tác HSD (đổi 31/12/9999 về lại null)...");
    
    try {
        const batch = db.batch();
        const lotsRef = db.collection('inventory_lots');
        
        // Truy vấn tất cả các document có expiryDate là ngày sentinel
        const snapshot = await lotsRef.where('expiryDate', '==', SENTINEL_DATE).get();

        if (snapshot.empty) {
            console.log("✅ Không tìm thấy lô hàng nào có HSD là 31/12/9999. Không cần hoàn tác.");
            return;
        }

        console.log(`- Tìm thấy ${snapshot.size} lô hàng cần hoàn tác.`);

        snapshot.forEach(doc => {
            console.log(`  - Chuẩn bị hoàn tác cho lô ID: ${doc.id}`);
            // Cập nhật trường expiryDate về lại giá trị null
            batch.update(doc.ref, { expiryDate: null });
        });

        await batch.commit();

        console.log(`\n🎉 HOÀN TẤT! Đã hoàn tác thành công ${snapshot.size} lô hàng về HSD null.`);

    } catch (error) {
        console.error("\n❌ Đã xảy ra lỗi nghiêm trọng trong quá trình hoàn tác:", error);
    }
}

// Chạy hàm chính
revertSentinelDatesToNull();