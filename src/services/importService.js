// src/services/importService.js
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, limit, startAfter, endBefore, limitToLast } from 'firebase/firestore';

const PAGE_SIZE = 15;
const importTicketsCollection = collection(db, 'import_tickets');

/**
 * Lấy một trang dữ liệu phiếu nhập từ Firestore.
 * @param {string} direction - Hướng phân trang ('next', 'prev', 'first').
 * @param {object | null} cursor - Con trỏ tài liệu Firestore.
 * @returns {Promise<{list: Array, firstVisible: object, lastVisible: object}>}
 */
export const fetchImportSlipsPage = async (direction = 'first', cursor = null) => {
    let q;
    const baseQuery = query(importTicketsCollection, orderBy("createdAt", "desc"));

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