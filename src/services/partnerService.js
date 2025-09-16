// src/services/partnerService.js

import { db } from '../firebaseConfig';
import {
    doc,
    setDoc,
    updateDoc,
    deleteDoc
} from 'firebase/firestore';

/**
 * Thêm một đối tác mới vào Firestore.
 * ID của đối tác sẽ được chuyển thành chữ hoa.
 * @param {string} partnerId - ID của đối tác mới.
 * @param {object} partnerData - Dữ liệu của đối tác (partnerName, partnerType).
 */
export const addPartner = async (partnerId, partnerData) => {
    // Luôn chuyển ID thành chữ hoa để đảm bảo tính nhất quán
    const partnerRef = doc(db, 'partners', partnerId.toUpperCase());
    await setDoc(partnerRef, partnerData);
};

/**
 * Cập nhật thông tin một đối tác đã tồn tại.
 * @param {string} partnerId - ID của đối tác cần cập nhật.
 * @param {object} partnerData - Dữ liệu mới của đối tác (partnerName, partnerType).
 */
export const updatePartner = async (partnerId, partnerData) => {
    const partnerDocRef = doc(db, 'partners', partnerId);
    await updateDoc(partnerDocRef, partnerData);
};

/**
 * Xóa một đối tác khỏi Firestore dựa vào ID.
 * @param {string} partnerId - ID của đối tác cần xóa.
 */
export const deletePartner = async (partnerId) => {
    const partnerDocRef = doc(db, 'partners', partnerId);
    await deleteDoc(partnerDocRef);
};