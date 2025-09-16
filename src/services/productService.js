// src/services/productService.js

import { db } from '../firebaseConfig';
import {
    doc,
    setDoc,
    updateDoc,
    deleteDoc
} from 'firebase/firestore';

/**
 * Thêm một sản phẩm mới vào Firestore.
 * @param {string} productId - ID của sản phẩm mới.
 * @param {object} productData - Dữ liệu của sản phẩm.
 */
export const addProduct = async (productId, productData) => {
    const productRef = doc(db, 'products', productId);
    await setDoc(productRef, productData);
};

/**
 * Cập nhật thông tin một sản phẩm đã có.
 * @param {string} productId - ID của sản phẩm cần cập nhật.
 * @param {object} productData - Dữ liệu mới của sản phẩm.
 */
export const updateProduct = async (productId, productData) => {
    const productDocRef = doc(db, 'products', productId);
    await updateDoc(productDocRef, productData);
};

/**
 * Xóa một sản phẩm khỏi Firestore dựa vào ID.
 * @param {string} productId - ID của sản phẩm cần xóa.
 */
export const deleteProduct = async (productId) => {
    const productDocRef = doc(db, 'products', productId);
    await deleteDoc(productDocRef);
};