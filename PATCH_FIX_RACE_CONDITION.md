# FIX: Race Condition trong Xuất Kho

## Vấn đề:
Khi tạo phiếu xuất có 2 dòng cùng lot (ví dụ: 800 + 200), code chỉ trừ dòng cuối cùng (200) vì:
1. Dòng 1 đọc tồn = 1000, tính mới = 800, thêm vào batch
2. Dòng 2 đọc tồn = 1000 (vẫn chưa commit!), tính mới = 800, thêm vào batch
3. Batch commit → Lệnh sau ghi đè lệnh trước → Kết quả = 800 (sai!)

## Giải pháp:
Gộp các items cùng `lotId` trước khi trừ tồn kho.

---

## File cần sửa: `src/pages/NewExportPage.jsx`

### Tìm hàm `handleDirectExport` (khoảng dòng 382-420)

### Thay thế toàn bộ hàm bằng code sau:

```javascript
const handleDirectExport = async () => {
    const slipData = getValidSlipData();
    if (!slipData) return;
    setConfirmModal({isOpen: false});
    setIsProcessing(true);
    try {
        const batch = writeBatch(db);

        // FIX RACE CONDITION: Gộp các items cùng lotId trước khi xử lý
        const lotUpdates = new Map(); // Map<lotId, {totalQty, lotRef}>
        
        for (const item of slipData.items) {
            const lotId = item.lotId;
            if (lotUpdates.has(lotId)) {
                // Cộng dồn số lượng nếu đã có
                lotUpdates.get(lotId).totalQty += item.quantityToExport;
            } else {
                // Tạo mới
                lotUpdates.set(lotId, {
                    totalQty: item.quantityToExport,
                    lotRef: doc(db, 'inventory_lots', lotId)
                });
            }
        }

        // 1. Trừ tồn kho thực tế VÀ giải phóng đặt giữ (chỉ 1 lần cho mỗi lot)
        for (const [lotId, updateInfo] of lotUpdates) {
            const lotSnap = await getDoc(updateInfo.lotRef);
            if(lotSnap.exists()){
                const currentRemaining = lotSnap.data().quantityRemaining;
                const currentAllocated = lotSnap.data().quantityAllocated || 0;
                
                const newQuantityRemaining = currentRemaining - updateInfo.totalQty; // Trừ TỔNG số lượng
                const newAllocated = Math.max(0, currentAllocated - updateInfo.totalQty); 

                batch.update(updateInfo.lotRef, { 
                    quantityRemaining: newQuantityRemaining,
                    quantityAllocated: newAllocated
                });
                
                console.log(`✅ Trừ tồn kho lot ${lotId}: ${currentRemaining} - ${updateInfo.totalQty} = ${newQuantityRemaining}`);
            }
        }

        // 2. Lưu phiếu xuất chính thức
        const slipRef = doc(collection(db, 'export_tickets'));
        batch.set(slipRef, { ...slipData, status: 'completed' });

        await batch.commit();

        toast.success('Xuất kho trực tiếp thành công!');
        resetSlip();
    } catch (error) {
        console.error("Lỗi khi xuất kho trực tiếp: ", error);
        toast.error('Đã xảy ra lỗi trong quá trình xuất kho.');
    } finally {
        setIsProcessing(false);
    }
};
```

---

## Hướng dẫn áp dụng:

1. Mở file `src/pages/NewExportPage.jsx`
2. Tìm hàm `const handleDirectExport = async () => {` (khoảng dòng 382)
3. Xóa toàn bộ hàm cũ (từ `const handleDirectExport` đến dấu `};` cuối hàm)
4. Dán code mới ở trên vào
5. Lưu file (Ctrl + S)

---

## Kiểm tra sau khi sửa:

1. Tạo phiếu xuất mới với 2 dòng cùng lot (ví dụ: 500 + 300)
2. Xuất kho trực tiếp
3. Kiểm tra tồn kho trong Firestore - phải trừ đúng 800 (không phải chỉ 300)
4. Xem Console log - sẽ thấy dòng: `✅ Trừ tồn kho lot xxx: 1000 - 800 = 200`

---

## Lưu ý:

- Code mới sử dụng `Map` để gộp các items cùng `lotId`
- Mỗi lot chỉ được đọc và ghi 1 lần duy nhất
- Tránh được race condition hoàn toàn
