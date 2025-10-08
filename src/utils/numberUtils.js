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

// src/utils/numberUtils.js (Sửa calculateCaseCount)

/**
 * Tính toán số kiện/đơn vị quy đổi và trả về MỘT MẢNG [Kết quả, Công thức Áp dụng].
 * @param {number} quantity - Số lượng.
 * @param {number} factor - Tỷ lệ quy đổi (Ví dụ: 100).
 * @param {string} unit - Đơn vị tính của sản phẩm (Ví dụ: Lọ).
 * @returns {object} - { value: number, action: 'MULTIPLY'/'DIVIDE' }
 */
// src/utils/numberUtils.js (Sửa calculateCaseCount)

export const calculateCaseCount = (quantity, factor, unit) => {
    if (!quantity || !factor || factor <= 0) return { value: 0, action: 'NONE' };
    
    const lowerUnit = unit ? unit.toLowerCase().trim() : '';

    // LOGIC QUY ĐỔI XUÔI (NHÂN): unit là ĐVT đóng gói CẤP 1 (Hộp, Lọ, Thùng - cho trường hợp Lít)
    // Áp dụng cho: 246001 (Hộp -> Lọ), 334224 (Thùng -> Lít)
    if (lowerUnit === 'hộp' || lowerUnit === 'lọ' || lowerUnit === 'thùng') {
        const result = quantity * factor; 
        return { value: Math.round(result * 100) / 100, action: 'MULTIPLY' };
    } 
    
    // LOGIC QUY ĐỔI NGƯỢC (CHIA): unit là ĐVT đóng gói CẤP CAO HƠN hoặc ĐVT nhỏ (Khay, Chai, Test)
    // Áp dụng cho: 491452 (Khay -> Thùng)
    const result = quantity / factor;
    return { value: Math.round(result * 100) / 100, action: 'DIVIDE' };
};