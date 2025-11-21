// scripts/syncInventoryToProducts.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Cấu hình Service Account
const serviceAccount = require('../serviceAccountKey.json');

try {
  initializeApp({ credential: cert(serviceAccount) });
} catch (e) {}

const db = getFirestore();

const syncData = async () => {
  console.log('🚀 Bắt đầu đồng bộ dữ liệu tồn kho sang collection Products...');

  try {
    // 1. Lấy tất cả summary
    const summariesSnapshot = await db.collection('product_summaries').get();
    
    if (summariesSnapshot.empty) {
      console.log('Không có dữ liệu summary.');
      return;
    }

    console.log(`Tìm thấy ${summariesSnapshot.size} mã hàng cần đồng bộ.`);
    
    const batchArray = [];
    batchArray.push(db.batch());
    let operationCounter = 0;
    let batchIndex = 0;

    for (const doc of summariesSnapshot.docs) {
      const summary = doc.data();
      const productId = doc.id;
      const productRef = db.collection('products').doc(productId);

      // Dữ liệu cần update vào products
      const updateData = {
        totalRemaining: summary.totalRemaining || 0,
        nearestExpiryDate: summary.nearestExpiryDate || null,
        hasInventory: (summary.totalRemaining > 0)
      };

      batchArray[batchIndex].update(productRef, updateData);
      operationCounter++;

      // Firestore chỉ cho phép 500 lệnh/batch
      if (operationCounter === 499) {
        batchArray.push(db.batch());
        batchIndex++;
        operationCounter = 0;
      }
    }

    // Thực thi tất cả các batch
    console.log(`Đang thực thi ${batchArray.length} batches...`);
    await Promise.all(batchArray.map(batch => batch.commit()));

    console.log('✅ ĐỒNG BỘ THÀNH CÔNG! Tất cả sản phẩm đã có trường totalRemaining.');

  } catch (error) {
    console.error('❌ Lỗi khi đồng bộ:', error);
  }
};

syncData();