// File: scripts/verifyAllocations.js (Phiên bản Nâng cấp)

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Hàm chính để kiểm tra và đối chiếu TOÀN BỘ số lượng đặt giữ (quantityAllocated).
 */
async function verifyAllAllocations() {
  console.log("Bắt đầu quá trình kiểm toán toàn bộ số lượng đặt giữ...");

  // --- BƯỚC 1: Tính toán số lượng đặt giữ LÝ THUYẾT (chỉ từ các phiếu 'pending') ---
  const pendingSlipsRef = db.collection('export_tickets').where('status', '==', 'pending');
  const theoreticalAllocations = new Map(); // Map: { lotId => totalQuantity }

  try {
    const snapshot = await pendingSlipsRef.get();
    
    if (snapshot.empty) {
      console.log("Thông tin: Không có phiếu xuất nào ở trạng thái 'pending'.");
    } else {
        console.log(`Đã tìm thấy ${snapshot.size} phiếu 'pending'. Đang tính toán số lượng đặt giữ cần thiết...`);
        snapshot.forEach(doc => {
            const slip = doc.data();
            if (slip.items && Array.isArray(slip.items)) {
                slip.items.forEach(item => {
                    const lotId = item.lotId;
                    const quantity = Number(item.quantityToExport || item.quantityExported || 0);

                    if (lotId && quantity > 0) {
                        const currentQty = theoreticalAllocations.get(lotId) || 0;
                        theoreticalAllocations.set(lotId, currentQty + quantity);
                    }
                });
            }
        });
    }

    // --- BƯỚC 2: Lấy số lượng đặt giữ THỰC TẾ từ TẤT CẢ các lô hàng ---
    console.log("\nĐang quét toàn bộ kho để lấy số lượng đặt giữ thực tế...");
    const inventoryLotsRef = db.collection('inventory_lots');
    const allocatedLotsSnap = await inventoryLotsRef.where('quantityAllocated', '>', 0).get();
    
    const actualAllocations = new Map(); // Map: { lotId => actualQuantity }
    allocatedLotsSnap.forEach(doc => {
        actualAllocations.set(doc.id, doc.data().quantityAllocated || 0);
    });

    console.log(`Tìm thấy ${actualAllocations.size} lô hàng đang có số lượng đặt giữ > 0.`);

    // --- BƯỚC 3: Đối chiếu và Báo cáo Chênh lệch ---
    console.log("\nBắt đầu đối chiếu...");
    let discrepanciesFound = 0;
    
    // Tạo một danh sách tổng hợp tất cả các lotId cần kiểm tra từ cả hai nguồn
    const allLotIdsToCheck = new Set([...theoreticalAllocations.keys(), ...actualAllocations.keys()]);

    if (allLotIdsToCheck.size === 0) {
        console.log("✅ Hoàn tất! Không có phiếu 'pending' và không có lô nào bị đặt giữ. Dữ liệu khớp.");
        return;
    }

    for (const lotId of allLotIdsToCheck) {
        const theoreticalQty = theoreticalAllocations.get(lotId) || 0;
        const actualQty = actualAllocations.get(lotId) || 0;

        if (theoreticalQty !== actualQty) {
            discrepanciesFound++;
            console.error(`\n❌ LỖI #${discrepanciesFound}: Tìm thấy chênh lệch ở Lô ID: ${lotId}`);
            
            const lotRef = inventoryLotsRef.doc(lotId);
            const lotDoc = await lotRef.get();
            if(lotDoc.exists) {
                const lotData = lotDoc.data();
                console.log(`   - Sản phẩm: ${lotData.productId} - Lô: ${lotData.lotNumber}`);
            }
            console.log(`   - Số lượng CẦN đặt giữ (từ phiếu pending): ${theoreticalQty}`);
            console.log(`   - Số lượng THỰC TẾ đang đặt giữ trong kho: ${actualQty}`);
        }
    }

    // --- BƯỚC 4: Đưa ra kết luận ---
    if (discrepanciesFound === 0) {
      console.log(`\n✅ Hoàn tất! Đã kiểm tra ${allLotIdsToCheck.size} lô hàng. Không tìm thấy chênh lệch nào.`);
    } else {
      console.warn(`\n⚠️ Hoàn tất! Tìm thấy tổng cộng ${discrepanciesFound} chênh lệch. Vui lòng kiểm tra và sửa lại dữ liệu thủ công.`);
    }

  } catch (error) {
    console.error("❌ Đã xảy ra lỗi nghiêm trọng trong quá trình kiểm tra:", error);
  }
}

// Chạy hàm chính
verifyAllAllocations();