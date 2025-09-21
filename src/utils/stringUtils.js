// src/utils/stringUtils.js
export const normalizeString = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
};

/**
 * Tách một chuỗi thành một mảng các từ khóa đã được chuẩn hóa.
 * Ví dụ: "Công ty Anh Khôi" -> ["cong", "ty", "anh", "khoi"]
 * @param {string} name - Chuỗi tên cần xử lý.
 * @returns {string[]} - Mảng các từ khóa.
 */
export const generateKeywords = (name) => {
  if (!name) return [];
  const normalizedName = normalizeString(name);
  const keywords = normalizedName.split(' ');
  return keywords.filter(keyword => keyword.length > 0); // Loại bỏ các chuỗi rỗng
};