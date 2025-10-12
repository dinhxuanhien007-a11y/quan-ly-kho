import { SPECIAL_EXPIRY_SUBGROUPS } from '../constants'; // <-- THÊM DÒNG NÀY VÀO ĐẦU FILE

// src/utils/dateUtils.js

/**
 * Chuyển đổi một đối tượng Firebase Timestamp hoặc Date thành chuỗi dd/mm/yyyy.
 */
export const formatDate = (dateOrTimestamp) => {
  let date;
  if (dateOrTimestamp && typeof dateOrTimestamp.toDate === 'function') {
    date = dateOrTimestamp.toDate();
  } else if (dateOrTimestamp instanceof Date) {
    date = dateOrTimestamp;
  } else {
    return 'N/A';
  }

  if (isNaN(date.getTime())) {
      return 'N/A';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Chuyển đổi một chuỗi dd/mm/yyyy thành đối tượng Date.
 */
export const parseDateString = (dateString) => {
  if (!dateString) return null;
  try {
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    const dateObj = new Date(year, month - 1, day);
    if (dateObj.getFullYear() != year || dateObj.getMonth() != month - 1 || dateObj.getDate() != day) {
       return null;
    }
    return dateObj;
  } catch (error) {
    console.error("Lỗi định dạng ngày tháng:", dateString, error);
    return null;
  }
};

/**
 * Định dạng một chuỗi số thành định dạng ngày dd/mm/yyyy khi người dùng gõ.
 */
export const formatExpiryDate = (value) => {
    if (!value) return '';
    const digitsOnly = value.replace(/\D/g, '');
    const truncatedDigits = digitsOnly.slice(0, 8);
    const len = truncatedDigits.length;

    if (len <= 2) return truncatedDigits;
    if (len <= 4) return `${truncatedDigits.slice(0, 2)}/${truncatedDigits.slice(2)}`;
    return `${truncatedDigits.slice(0, 2)}/${truncatedDigits.slice(2, 4)}/${truncatedDigits.slice(4)}`;
};

/**
 * PHIÊN BẢN MỚI: Xác định class màu sắc cho một dòng dựa trên ngày hết hạn và nhóm hàng.
 */
export const getRowColorByExpiry = (expiryDate, subGroup) => {
    if (!expiryDate || !expiryDate.toDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = expiryDate.toDate();
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // --- SỬA LẠI TẠI ĐÂY ---
    if (SPECIAL_EXPIRY_SUBGROUPS.includes(subGroup)) {
        if (diffDays < 0) return 'expired-black';
        if (diffDays <= 30) return 'near-expiry-red';
        if (diffDays <= 60) return 'near-expiry-orange';
        if (diffDays <= 90) return 'near-expiry-yellow';
    } 
    else {
        if (diffDays < 0) return 'expired-black';
        if (diffDays <= 70) return 'near-expiry-red';
        if (diffDays <= 140) return 'near-expiry-orange';
        if (diffDays <= 210) return 'near-expiry-yellow';
    }

    return '';
};

/**
 * PHIÊN BẢN MỚI: Trả về một chuỗi tiền tố cảnh báo dựa trên ngày hết hạn và nhóm hàng.
 */
export const getExpiryStatusPrefix = (expiryDate, subGroup) => {
  if (!expiryDate || !expiryDate.toDate) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = expiryDate.toDate();
  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return '❌ - ';

  // --- SỬA LẠI TẠI ĐÂY ---
  const nearExpiryThreshold = SPECIAL_EXPIRY_SUBGROUPS.includes(subGroup) ? 90 : 210;

  if (diffDays <= nearExpiryThreshold) return '⚠️ - ';

  return '';
};