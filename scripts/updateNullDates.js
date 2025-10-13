// D:\quan-ly-kho\scripts\updateNullDates.js
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();
const SENTINEL_DATE = new Date('9999-12-31T00:00:00Z');

async function updateNullExpiryDates() {
    console.log("🚀 Bắt đầu quá trình cập nhật HSD null thành ngày mặc định...");

    try {
        const batch = db.batch();
        const lotsRef = db.collection('inventory_lots');
        // Truy vấn tất cả các document có trường expiryDate là null
        const snapshot = await lotsRef.where('expiryDate', '==', null).get();

        if (snapshot.empty) {
            console.log("✅ Không tìm thấy lô hàng nào có HSD là null. Không cần cập nhật.");
            return;
        }

        console.log(`- Tìm thấy ${snapshot.size} lô hàng cần cập nhật.`);

        snapshot.forEach(doc => {
            console.log(`  - Chuẩn bị cập nhật cho lô ID: ${doc.id}`);
            batch.update(doc.ref, { expiryDate: SENTINEL_DATE });
        });

        await batch.commit();

        console.log(`\n🎉 HOÀN TẤT! Đã cập nhật thành công ${snapshot.size} lô hàng.`);

    } catch (error) {
        console.error("\n❌ Đã xảy ra lỗi nghiêm trọng:", error);
    }
}

updateNullExpiryDates();