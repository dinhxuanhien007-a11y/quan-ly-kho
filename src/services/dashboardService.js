import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Lấy danh sách các phiếu nhập đang ở trạng thái "pending".
 * @returns {Promise<Array>} Mảng các phiếu nhập cần xử lý.
 */
export const getPendingImportTickets = async () => {
    // Tạo một truy vấn đến collection 'import_tickets'
    const ticketsQuery = query(
        collection(db, 'import_tickets'),
        where("status", "==", "pending"), // Chỉ lấy các phiếu có status là 'pending'
        orderBy("createdAt", "desc"),    // Sắp xếp phiếu mới nhất lên đầu
        limit(15)                        // Giới hạn 15 phiếu để dashboard không quá tải
    );

    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Lấy danh sách các phiếu xuất đang ở trạng thái "pending".
 * @returns {Promise<Array>} Mảng các phiếu xuất cần xử lý.
 */
export const getPendingExportTickets = async () => {
    // Tương tự cho collection 'export_tickets'
    const ticketsQuery = query(
        collection(db, 'export_tickets'),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc"),
        limit(15)
    );

    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};