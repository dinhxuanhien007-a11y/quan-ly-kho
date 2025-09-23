// src/utils/numberUtils.js

/**
 * Định dạng một số (dùng '.' làm ngăn cách thập phân) sang chuỗi kiểu Việt Nam.
 * Ví dụ: 1234.5 -> "1.234,5"
 * @param {number | string} value - Giá trị cần định dạng.
 * @returns {string} - Chuỗi đã được định dạng.
 */
export const formatNumber = (value) => {
  if (value === null || value === undefined || value === '') return '';
  
  const numStr = String(value);
  const parts = numStr.split('.');
  const integerPart = parts[0];
  const decimalPart = parts.length > 1 ? parts[1] : '';

  const formattedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return decimalPart ? `${formattedIntegerPart},${decimalPart}` : formattedIntegerPart;
};

/**
 * Chuyển đổi chuỗi người dùng nhập về dạng số thô (dùng '.' làm ngăn cách thập phân).
 * Cho phép người dùng gõ dấu ',' hoặc '.' cho phần thập phân.
 * Ví dụ: "1.234,5" -> "1234.5"
 */
export const parseFormattedNumber = (value) => {
  if (typeof value !== 'string') return String(value);
  // Thay thế dấu phẩy bằng dấu chấm để chuẩn hóa
  const standardDecimal = value.replace(/,/g, '.');
  // Xóa tất cả các dấu chấm trừ dấu chấm cuối cùng (nếu có)
  const parts = standardDecimal.split('.');
  if (parts.length > 1) {
    const integerPart = parts.slice(0, -1).join('');
    const decimalPart = parts[parts.length - 1];
    return `${integerPart}.${decimalPart}`;
  }
  return standardDecimal;
};