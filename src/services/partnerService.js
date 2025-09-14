// src/services/partnerService.js
import { db } from '../firebaseConfig';
import { collection, getDocs, doc, deleteDoc, query, orderBy, limit, startAfter, endBefore, limitToLast, documentId } from 'firebase/firestore';

const PAGE_SIZE = 15;
const partnersCollection = collection(db, 'partners');

/**
 * Lấy một trang dữ liệu đối tác từ Firestore.
 * @param {string} direction - Hướng phân trang ('next', 'prev', 'first').
 * @param {object | null} cursor - Con trỏ tài liệu Firestore để bắt đầu hoặc kết thúc.
 * @returns {Promise<{list: Array, firstVisible: object, lastVisible: object}>} - Danh sách đối tác và các con trỏ.
 */
export const fetchPartnersPage = async (direction = 'first', cursor = null) => {
    let q;
    const baseQuery = query(partnersCollection, orderBy(documentId()));

    if (direction === 'next' && cursor) {
        q = query(baseQuery, startAfter(cursor), limit(PAGE_SIZE));
    } else if (direction === 'prev' && cursor) {
        q = query(baseQuery, endBefore(cursor), limitToLast(PAGE_SIZE));
    } else { // first
        q = query(baseQuery, limit(PAGE_SIZE));
    }

    const querySnapshot = await getDocs(q);
    const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return {
        list,
        firstVisible: querySnapshot.docs[0] || null,
        lastVisible: querySnapshot.docs[querySnapshot.docs.length - 1] || null,
    };
};

/**
 * Xóa một đối tác khỏi Firestore.
 * @param {string} partnerId - ID của đối tác cần xóa.
 * @returns {Promise<void>}
 */
export const deletePartnerById = async (partnerId) => {
    const partnerDocRef = doc(db, 'partners', partnerId);
    await deleteDoc(partnerDocRef);
};