const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// 1. Cấu hình Service Account
const serviceAccount = require('../serviceAccountKey.json');

try {
  initializeApp({ credential: cert(serviceAccount) });
} catch (e) {
  if (e.code !== 'app/duplicate-app') console.error(e);
}
const db = getFirestore();

// === CẤU HÌNH THAY ĐỔI CHO MÃ 657681 ===
const TARGET_PRODUCT_ID = '657681';  // Mã hàng cần sửa
const OLD_UNIT = 'Test';             // Đơn vị cũ (đang có trong hệ thống)
const NEW_UNIT = 'Hộp';              // Đơn vị mới muốn đổi
const CONVERSION_RATE = 100;         // 1 Hộp = 100 Test (Chia cho 100)
// ========================================

const convertUnit = async () => {
  console.log(`🚀 Bắt đầu chuyển đổi đơn vị cho mã: ${TARGET_PRODUCT_ID}`);
  console.log(`   Quy cách: 1 ${NEW_UNIT} = ${CONVERSION_RATE} ${OLD_UNIT}`);
  console.log(`   Hành động: Chia tồn kho cho ${CONVERSION_RATE} và đổi ĐVT thành "${NEW_UNIT}"`);

  try {
    const batch = db.batch();

    // 1. Cập nhật thông tin Sản phẩm gốc (products)
    const productRef = db.collection('products').doc(TARGET_PRODUCT_ID);
    const productSnap = await productRef.get();
    
    if (!productSnap.exists) {
        console.error('❌ Không tìm thấy mã hàng 657681 trong hệ thống!');
        return;
    }

    // Cập nhật ĐVT mới và Quy cách hiển thị (nếu chưa đúng)
    batch.update(productRef, {
        unit: NEW_UNIT,
        conversionFactor: 1, // Reset về 1 vì giờ Hộp là đơn vị chuẩn
        packaging: "100 Test/ Hộp", // Cập nhật luôn text quy cách cho chuẩn
        updatedAt: new Date()
    });
    console.log('   -> Đã thêm lệnh sửa thông tin sản phẩm (Product Master).');

    // 2. Cập nhật tất cả các Lô hàng tồn kho (inventory_lots)
    const lotsSnapshot = await db.collection('inventory_lots')
        .where('productId', '==', TARGET_PRODUCT_ID)
        .get();

    if (lotsSnapshot.empty) {
        console.log('   ⚠️ Không tìm thấy lô hàng nào trong kho.');
    } else {
        console.log(`   -> Tìm thấy ${lotsSnapshot.size} lô hàng cần chuyển đổi.`);
        
        lotsSnapshot.forEach(doc => {
            const lot = doc.data();
            const oldRemaining = lot.quantityRemaining;
            
            // Tính toán số lượng mới
            const newRemaining = oldRemaining / CONVERSION_RATE;
            // Giữ nguyên số nhập ban đầu nhưng chia lại theo đơn vị mới để thống nhất
            const newImported = (lot.quantityImported || oldRemaining) / CONVERSION_RATE;

            console.log(`      - Lô ${lot.lotNumber}: ${oldRemaining} ${OLD_UNIT}  ==>  ${newRemaining} ${NEW_UNIT}`);

            batch.update(doc.ref, {
                unit: NEW_UNIT,
                packaging: "100 Test/ Hộp", // Cập nhật text quy cách cho lô
                quantityRemaining: newRemaining,
                quantityImported: newImported,
                quantityAllocated: (lot.quantityAllocated || 0) / CONVERSION_RATE
            });
        });
    }

    // 3. Thực thi Batch
    await batch.commit();
    console.log('✅ CHUYỂN ĐỔI THÀNH CÔNG!');
    console.log('👉 Bước tiếp theo: Hãy chạy script đồng bộ (syncInventoryToProducts.js) để cập nhật Dashboard.');

  } catch (error) {
    console.error('❌ Lỗi:', error);
  }
};

convertUnit();