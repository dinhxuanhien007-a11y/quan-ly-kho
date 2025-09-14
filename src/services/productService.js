// src/services/productService.js
import { db } from '../firebaseConfig';
import { collection, getDocs, doc, deleteDoc, query, orderBy, where, limit, startAfter, endBefore, limitToLast, documentId } from 'firebase/firestore';

const PAGE_SIZE = 15;
const productsCollection = collection(db, 'products');

/**
 * Lấy một trang dữ liệu sản phẩm từ Firestore, có hỗ trợ tìm kiếm.
 * @param {string} searchTerm - Từ khóa tìm kiếm theo ID sản phẩm.
 * @param {string} direction - Hướng phân trang ('next', 'prev', 'first').
 * @param {object | null} cursor - Con trỏ tài liệu Firestore.
 * @returns {Promise<{list: Array, firstVisible: object, lastVisible: object}>}
 */
export const fetchProductsPage = async (searchTerm, direction = 'first', cursor = null) => {
    let q = query(productsCollection, orderBy(documentId()));

    // Áp dụng bộ lọc tìm kiếm
    if (searchTerm) {
        const upperSearchTerm = searchTerm.toUpperCase();
        q = query(q, where(documentId(), '>=', upperSearchTerm), where(documentId(), '<=', upperSearchTerm + '\uf8ff'));
    }

    // Áp dụng logic phân trang
    if (direction === 'next' && cursor) {
        q = query(q, startAfter(cursor), limit(PAGE_SIZE));
    } else if (direction === 'prev' && cursor) {
        q = query(q, endBefore(cursor), limitToLast(PAGE_SIZE));
    } else { // first
        q = query(q, limit(PAGE_SIZE));
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
 * Xóa một sản phẩm khỏi Firestore.
 * @param {string} productId - ID của sản phẩm cần xóa.
 * @returns {Promise<void>}
 */
export const deleteProductById = async (productId) => {
    const productDocRef = doc(db, 'products', productId);
    await deleteDoc(productDocRef);
};