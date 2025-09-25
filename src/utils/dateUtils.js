// src/utils/dateUtils.js

/**
 * Chuyển đổi một đối tượng Firebase Timestamp hoặc Date thành chuỗi dd/mm/yyyy.
 * @param {object | Date} dateOrTimestamp - Đối tượng Timestamp của Firebase hoặc đối tượng Date.
 * @returns {string} - Chuỗi ngày tháng đã định dạng hoặc 'N/A'.
 */
export const formatDate = (dateOrTimestamp) => {
  // --- BẮT ĐẦU NÂNG CẤP ---
  let date;

  // Kiểm tra xem có phải là Timestamp của Firebase không và chuyển đổi nó
  if (dateOrTimestamp && typeof dateOrTimestamp.toDate === 'function') {
    date = dateOrTimestamp.toDate();
  }
  // Nếu không, kiểm tra xem nó có phải là một đối tượng Date của JavaScript không
  else if (dateOrTimestamp instanceof Date) {
    date = dateOrTimestamp;
  }
  // Nếu không phải cả hai, chúng ta không thể định dạng nó
  else {
    return 'N/A';
  }

  // Đảm bảo chúng ta có một ngày hợp lệ trước khi tiếp tục
  if (isNaN(date.getTime())) {
      return 'N/A';
  }
  // --- KẾT THÚC NÂNG CẤP ---

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Chuyển đổi một chuỗi dd/mm/yyyy thành đối tượng Date.
 * @param {string} dateString - Chuỗi ngày tháng theo định dạng dd/mm/yyyy.
 * @returns {Date | null} - Đối tượng Date hoặc null nếu định dạng sai.
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
 * @param {string} value - Giá trị từ ô input.
 * @returns {string} - Chuỗi đã được định dạng.
 */
export const formatExpiryDate = (value) => {
    if (!value) return '';
    const digitsOnly = value.replace(/\D/g, '');
    const truncatedDigits = digitsOnly.slice(0, 8);
    const len = truncatedDigits.length;

    if (len <= 2) {
        return truncatedDigits;
    }
    if (len <= 4) {
        return `${truncatedDigits.slice(0, 2)}/${truncatedDigits.slice(2)}`;
    }
    return `${truncatedDigits.slice(0, 2)}/${truncatedDigits.slice(2, 4)}/${truncatedDigits.slice(4)}`;
};

/**
 * Xác định class màu sắc cho một dòng dựa trên ngày hết hạn.
 * @param {object} expiryDate - Đối tượng Timestamp của Firebase.
 * @returns {string} - Tên class CSS tương ứng.
 */
export const getRowColorByExpiry = (expiryDate) => {
    if (!expiryDate || !expiryDate.toDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = expiryDate.toDate();
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'expired-black';
    if (diffDays <= 60) return 'near-expiry-red';
    if (diffDays <= 90) return 'near-expiry-orange';
    if (diffDays <= 120) return 'near-expiry-yellow';
    return '';
};

/**
 * Trả về một chuỗi tiền tố cảnh báo dựa trên ngày hết hạn.
 * @param {object} expiryDate - Đối tượng Timestamp của Firebase.
 * @returns {string} - Chuỗi tiền tố cảnh báo (ví dụ: '⚠️ CẬN DATE - ').
 */
export const getExpiryStatusPrefix = (expiryDate) => {
  if (!expiryDate || !expiryDate.toDate) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = expiryDate.toDate();
  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return '❌ - ';
  if (diffDays <= 120) return '⚠️ - ';
  return '';
};