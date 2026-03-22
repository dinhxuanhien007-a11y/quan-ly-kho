// export_inventory_tsv.mjs
// Chạy: node export_inventory_tsv.mjs
// Output: webapp_inventory_lots_new.tsv (cùng thư mục)

import admin from 'firebase-admin';
import { createReadStream, createWriteStream } from 'fs';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Đọc service account key
const saPath = join(__dirname, 'scripts', 'serviceAccountKey.json');
const sa = JSON.parse(readFileSync(saPath, 'utf8'));

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function exportInventoryLots() {
    console.log('Đang tải inventory_lots từ Firestore...');

    const snap = await db.collection('inventory_lots').get();
    console.log(`Tổng documents: ${snap.size}`);

    const rows = [];

    snap.forEach(doc => {
        const d = doc.data();

        // Lấy lotNumber: ưu tiên field, fallback về doc.id nếu trông như số lô
        // (doc.id auto-generated Firestore = 20 chars random, số lô thường ngắn hơn)
        let lotNumber = d.lotNumber ?? '';
        if (lotNumber === '' && doc.id.length < 20) {
            lotNumber = doc.id;
        }

        // Parse expiryDate
        let expiryDate = '';
        if (d.expiryDate) {
            try {
                const dt = d.expiryDate.toDate ? d.expiryDate.toDate() : new Date(d.expiryDate);
                if (!isNaN(dt.getTime())) {
                    const y = dt.getFullYear();
                    const m = String(dt.getMonth() + 1).padStart(2, '0');
                    const day = String(dt.getDate()).padStart(2, '0');
                    expiryDate = `${y}-${m}-${day}`;
                }
            } catch (e) { }
        }

        rows.push({
            productId: d.productId ?? '',
            lotNumber,
            expiryDate,
            quantityRemaining: d.quantityRemaining ?? 0,
            unit: d.unit ?? '',
        });
    });

    // Sắp xếp cho dễ đọc
    rows.sort((a, b) => {
        if (a.productId < b.productId) return -1;
        if (a.productId > b.productId) return 1;
        return String(a.lotNumber).localeCompare(String(b.lotNumber));
    });

    // Xuất TSV
    const header = 'productId\tlotNumber\texpiryDate\tquantityRemaining\tunit';
    const lines = rows.map(r =>
        [r.productId, r.lotNumber, r.expiryDate, r.quantityRemaining, r.unit].join('\t')
    );

    const output = [header, ...lines].join('\n');
    const outPath = join(__dirname, 'webapp_inventory_lots_new.tsv');
    writeFileSync(outPath, output, 'utf8');

    console.log(`✅ Xuất xong! ${rows.length} dòng → ${outPath}`);

    // Thống kê nhanh
    const active = rows.filter(r => Number(r.quantityRemaining) > 0);
    const noLot = active.filter(r => r.lotNumber === '');
    console.log(`\nThống kê:`);
    console.log(`  Tổng documents: ${rows.length}`);
    console.log(`  Qty > 0: ${active.length}`);
    console.log(`  Qty > 0 nhưng không có số lô: ${noLot.length}`);

    process.exit(0);
}

exportInventoryLots().catch(err => {
    console.error('Lỗi:', err);
    process.exit(1);
});
