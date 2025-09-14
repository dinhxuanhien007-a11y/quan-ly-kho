// src/services/stocktakeService.js
import { db } from '../firebaseConfig';
import { doc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { toast } from 'react-toastify';

/**
 * Xóa một phiên kiểm kê và tất cả các mục vật tư con bên trong nó.
 * Firestore không tự động xóa subcollection, nên chúng ta phải làm việc này bằng tay.
 * @param {string} sessionId - ID của phiên kiểm kê cần xóa.
 */
export const deleteStocktakeSession = async (sessionId) => {
    const sessionRef = doc(db, 'stocktakes', sessionId);
    const itemsRef = collection(db, 'stocktakes', sessionId, 'items');

    // Bước 1: Lấy tất cả các mục vật tư trong subcollection 'items'
    const itemsSnapshot = await getDocs(itemsRef);
    
    if (itemsSnapshot.empty) {
        // Nếu không có mục con nào, chỉ cần xóa document cha
        await deleteDoc(sessionRef);
        return;
    }

    // Bước 2: Xóa tất cả các mục vật tư con theo từng lô (batch) để đảm bảo hiệu năng
    // Firestore giới hạn 500 thao tác/batch
    const MAX_BATCH_SIZE = 500;
    let batch = writeBatch(db);
    let count = 0;

    for (const itemDoc of itemsSnapshot.docs) {
        batch.delete(itemDoc.ref);
        count++;
        if (count === MAX_BATCH_SIZE) {
            // Khi đủ 500, thực thi batch và tạo batch mới
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
            toast.info("Đang xóa dữ liệu kiểm kê...");
        }
    }

    // Thực thi batch cuối cùng nếu còn thao tác
    if (count > 0) {
        await batch.commit();
    }

    // Bước 3: Sau khi đã xóa hết các mục con, xóa document cha (phiên kiểm kê)
    await deleteDoc(sessionRef);
};