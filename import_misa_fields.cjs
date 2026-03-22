// import_misa_fields.cjs
// Chạy: node import_misa_fields.cjs
const admin = require('firebase-admin');
const sa = require('./scripts/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// 5 mã có mã Misa khác (thêm -INT00)
const altCodeMap = {"3691-12": "3691-12-INT00", "5327-02": "5327-02-INT00", "5476-04": "5476-04-INT00", "8703-04": "8703-04-INT00", "8803-03": "8803-03-INT00"};

// Mã WebKho có tồn kho nhưng Misa chưa có mã này
const missingFromMisa = ["231539", "34334637", "364879", "366430", "441183", "441476", "443051", "443191", "443682", "443687", "443693", "443704", "444004", "491332", "649760", "649761", "651351", "L1-HOSE"];

async function run() {
  const updates = [];
  for (const [webCode, misaCode] of Object.entries(altCodeMap)) {
    updates.push([webCode, { misaCode }]);
  }
  for (const code of missingFromMisa) {
    updates.push([code, { missingFromMisa: true }]);
  }

  const BATCH_SIZE = 400;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const [id, data] of updates.slice(i, i + BATCH_SIZE)) {
      batch.update(db.collection('products').doc(id), data);
    }
    await batch.commit();
  }

  console.log('✅ Xong! Đã cập nhật:');
  console.log(`  - ${Object.keys(altCodeMap).length} mã misaCode`);
  console.log(`  - ${missingFromMisa.length} mã missingFromMisa`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
