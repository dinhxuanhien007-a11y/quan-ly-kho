// D:\quan-ly-kho\migrate_lots.js

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path'; // THAY ĐỔI: Sửa require('path') thành import path from 'path'
import * as fs from 'fs'; // THÊM: Import fs để đọc file

// --- CÁC THAM SỐ CẤU HÌNH ---
const COLLECTION_NAME = 'inventory_lots'; 
// ĐƯỜNG DẪN ĐẾN FILE KEY CỦA BẠN
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'scripts', 'serviceAccountKey.json');
// --- KẾT THÚC CÁC THAM SỐ ---

// Khởi tạo Firebase Admin SDK
try {
    // THAY ĐỔI: Đọc file Service Account
    const serviceAccountData = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8')); 

    initializeApp({
        credential: cert(serviceAccountData),
    });
} catch (error) {
    console.error("LỖI KHỞI TẠO ADMIN SDK:", error.message);
    console.log("Vui lòng kiểm tra file 'serviceAccountKey.json' có tồn tại và hợp lệ không.");
    process.exit(1);
}

const db = getFirestore();
const MAX_BATCH_SIZE = 490;

async function runLotAllocationMigration() {
    console.log(`\n--- BẮT ĐẦU MIGRATION: Thêm quantityAllocated = 0 ---`);

    try {
        const snapshot = await db.collection(COLLECTION_NAME).get();

        if (snapshot.empty) {
            console.log(`✅ Hoàn tất: Không có lô hàng nào trong collection '${COLLECTION_NAME}'.`);
            return;
        }

        let batch = db.batch();
        let counter = 0;
        let totalUpdated = 0;

        console.log(`Đã tìm thấy ${snapshot.size} lô hàng. Bắt đầu xử lý...`);

        snapshot.forEach(doc => {
            const lotData = doc.data();
            
            if (lotData.quantityAllocated === undefined) { 
                batch.update(doc.ref, { 
                    quantityAllocated: 0 
                });
                counter++;
                totalUpdated++;
            }
            
            if (counter >= MAX_BATCH_SIZE) {
                batch.commit();
                batch = db.batch(); 
                counter = 0;
                console.log(`\t> Đã commit 1 batch (${totalUpdated} lô đã cập nhật).`);
            }
        });
        
        if (counter > 0) {
            await batch.commit();
        }

        console.log(`\n--- MIGRATION HOÀN TẤT ---`);
        console.log(`✅ Đã kiểm tra ${snapshot.size} lô hàng.`);
        console.log(`✅ Tổng cộng ${totalUpdated} lô hàng đã được thêm trường 'quantityAllocated: 0'.`);

    } catch (error) {
        console.error(`\n❌ LỖI NGHIÊM TRỌNG TRONG KHI MIGRATION:`, error.message);
    }
}

runLotAllocationMigration();