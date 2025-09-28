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

// Dán vào file: src/utils/stringUtils.js

// Hàm này dùng để chuyển các từ số tiếng Việt thành chữ số tương ứng
export const convertVietnameseWordsToNumbers = (str) => {
    if (!str) return '';
    
    const numberWords = {
        'không': '0', 'linh': '0',
        'một': '1', 'mốt': '1',
        'hai': '2',
        'ba': '3',
        'bốn': '4', 'tư': '4',
        'năm': '5', 'lăm': '5',
        'sáu': '6',
        'bảy': '7', 'bẩy': '7',
        'tám': '8',
        'chín': '9',
    };

    let result = str.toLowerCase();
    for (const word in numberWords) {
        // Sử dụng RegExp để thay thế tất cả các lần xuất hiện của từ
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        result = result.replace(regex, numberWords[word]);
    }
    return result;
};