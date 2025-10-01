// scripts/backfillImportIds.js

import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://kho-ptbiomed-default-rtdb.asia-southeast1.firebasedatabase.app" // Hãy chắc chắn đây là URL đúng
});

const db = admin.firestore();

async function backfillData() {
    console.log('Bắt đầu quá trình cập nhật dữ liệu...');
    const lotsRef = db.collection('inventory_lots');
    const ticketsRef = db.collection('import_tickets');
    let batch = db.batch();
    let updatesCount = 0;
    const ambiguousLots = [];

    // BƯỚC 1: LẤY TẤT CẢ CÁC LÔ HÀNG
    const allLotsSnapshot = await lotsRef.get();

    // BƯỚC 2: LỌC RA NHỮNG LÔ BỊ THIẾU importTicketId BẰNG CODE
    const lotsToProcess = allLotsSnapshot.docs.filter(doc => !doc.data().importTicketId);

    if (lotsToProcess.length === 0) {
        console.log('Không có lô hàng nào cần cập nhật. Mọi thứ đã hoàn hảo!');
        return;
    }

    console.log(`Tìm thấy ${lotsToProcess.length} lô hàng cần được liên kết.`);

    // BƯỚC 3: LẶP QUA DANH SÁCH ĐÃ LỌC
    for (const lotDoc of lotsToProcess) {
    const lotData = lotDoc.data();
    const { productId, lotNumber, supplierName, importDate } = lotData;

    // BƯỚC SỬA LỖI: Bỏ qua nếu không có tên Nhà cung cấp
    if (!supplierName) {
        ambiguousLots.push({
            lotId: lotDoc.id,
            reason: 'Thiếu thông tin Nhà cung cấp (supplierName)'
        });
        continue; // Chuyển sang lô hàng tiếp theo
    }

        // Tính toán khoảng thời gian trong ngày để tìm kiếm
        const importDayStart = importDate.toDate();
        importDayStart.setHours(0, 0, 0, 0);

        const importDayEnd = new Date(importDayStart);
        importDayEnd.setHours(23, 59, 59, 999);

        // Bắt đầu tìm kiếm phiếu nhập gốc
        const ticketQuery = await ticketsRef
            .where('supplierName', '==', supplierName)
            .where('productIds', 'array-contains', productId)
            .where('createdAt', '>=', importDayStart)
            .where('createdAt', '<=', importDayEnd)
            .get();

        const matchingTickets = [];
        ticketQuery.forEach(ticketDoc => {
            const ticketData = ticketDoc.data();
            const hasMatchingItem = ticketData.items.some(item => 
                item.productId === productId && item.lotNumber === lotNumber
            );
            if (hasMatchingItem) {
                matchingTickets.push(ticketDoc.id);
            }
        });

        if (matchingTickets.length === 1) {
            const ticketId = matchingTickets[0];
            console.log(`Đã tìm thấy liên kết cho lô ${lotDoc.id} -> Phiếu nhập ${ticketId}`);
            batch.update(lotDoc.ref, { importTicketId: ticketId });
            updatesCount++;
        } else {
            ambiguousLots.push({
                lotId: lotDoc.id,
                reason: matchingTickets.length === 0 ? 'Không tìm thấy phiếu nhập' : `Tìm thấy ${matchingTickets.length} phiếu nhập trùng khớp`
            });
        }

        if (updatesCount > 0 && updatesCount % 400 === 0) {
            console.log(`Đang ghi ${updatesCount} cập nhật xuống cơ sở dữ liệu...`);
            await batch.commit();
            batch = db.batch();
        }
    }

    if (updatesCount > 0 && updatesCount % 400 !== 0) {
        await batch.commit();
    }
    
    console.log('-------------------------------------------');
    console.log('QUÁ TRÌNH HOÀN TẤT!');
    console.log(`✅ Cập nhật thành công: ${updatesCount} lô hàng.`);

    if (ambiguousLots.length > 0) {
        console.log(`⚠️ Cảnh báo: ${ambiguousLots.length} lô hàng không thể tự động liên kết. Vui lòng kiểm tra thủ công:`);
        console.table(ambiguousLots);
    }
}

backfillData().catch(console.error);