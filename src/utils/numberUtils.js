// src/utils/numberUtils.js

/**
 * Định dạng một số với dấu chấm phân cách hàng nghìn.
 * @param {number | string} value - Giá trị cần định dạng.
 * @returns {string} - Chuỗi đã được định dạng hoặc chuỗi rỗng nếu không hợp lệ.
 */
export const formatNumber = (value) => {
  // Chuyển đổi giá trị về dạng số
  const number = Number(value);

  // Nếu không phải là một số hợp lệ, trả về chuỗi rỗng
  if (isNaN(number)) {
    return '';
  }

  // Sử dụng toLocaleString với locale 'vi-VN' để có dấu chấm phân cách
  return number.toLocaleString('vi-VN');
};

/**
 * Chuyển đổi chuỗi số đã định dạng (vd: "1.234") về dạng chuỗi số thô ("1234").
 * @param {string} value - Chuỗi cần chuyển đổi.
 * @returns {string} - Chuỗi số thô.
 */
export const parseFormattedNumber = (value) => {
  if (typeof value !== 'string') {
    return String(value);
  }
  // Xóa tất cả dấu chấm trong chuỗi
  return value.replace(/\./g, '');
};