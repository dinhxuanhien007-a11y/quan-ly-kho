// src/utils/dateUtils.js

/**
 * Chuyển đổi một đối tượng Firebase Timestamp hoặc Date thành chuỗi dd/mm/yyyy.
 * @param {object | Date} timestamp - Đối tượng Timestamp của Firebase hoặc đối tượng Date.
 * @returns {string} - Chuỗi ngày tháng đã định dạng hoặc chuỗi rỗng.
 */
export const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
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
    // Chú ý: tháng trong new Date() bắt đầu từ 0
    const dateObj = new Date(year, month - 1, day);
    // Kiểm tra xem ngày có hợp lệ không (ví dụ: 31/02/2025)
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
    // 1. Chỉ giữ lại các ký tự số
    const digitsOnly = value.replace(/\D/g, '');
    // 2. Giới hạn tối đa 8 ký tự (ddmmyyyy)
    const truncatedDigits = digitsOnly.slice(0, 8);
    const len = truncatedDigits.length;

    // 3. Áp dụng định dạng dựa trên độ dài
    if (len <= 2) {
        return truncatedDigits; // Gõ tới ngày (dd)
    }
    if (len <= 4) {
        // Gõ tới tháng (dd/mm)
        return `${truncatedDigits.slice(0, 2)}/${truncatedDigits.slice(2)}`;
    }
    // Gõ tới năm (dd/mm/yyyy)
    return `${truncatedDigits.slice(0, 2)}/${truncatedDigits.slice(2, 4)}/${truncatedDigits.slice(4)}`;
};

/**
 * === HÀM MỚI ĐƯỢC THÊM VÀO ===
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