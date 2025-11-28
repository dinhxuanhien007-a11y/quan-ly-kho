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

// src/utils/stringUtils.js (Sửa getConversionFactor)

/**
 * PHIÊN BẢN 3: Ưu tiên trích xuất SỐ TỶ LỆ CUỐI CÙNG trong chuỗi (ví dụ: 50 Chai/Thùng -> 50)
 * @param {string} packagingStr - Chuỗi quy cách đóng gói.
 * @returns {number} - Tỷ lệ quy đổi, hoặc 1 nếu không phân tích được.
 */
export const getConversionFactor = (packagingStr) => {
    if (!packagingStr || packagingStr.toUpperCase() === "N/A") return 1;

    // TÌM CẶP TỶ LỆ DỄ ĐỌC NHẤT Ở CUỐI CHUỖI: vd: "100 Lọ / Hộp" HOẶC "50 Chai/ Thùng"
    // Regex tìm: (Số) [ĐVT] / [ĐVT]
    const ratios = packagingStr.match(/(\d+(\.\d+)?)\s*\w+\s*\/\s*\w+/gi);
    
    if (ratios && ratios.length > 0) {
        // Lấy cặp tỷ lệ CUỐI CÙNG (cấp đóng gói cao nhất hoặc quan trọng nhất)
        const lastRatio = ratios[ratios.length - 1]; 
        
        // Trích xuất SỐ TỶ LỆ (Factor) từ cặp cuối cùng
        const match = lastRatio.match(/(\d+(\.\d+)?)/); 
        if (match) {
            return Math.round(Number(match[1]));
        }
    } 
    
    // Trường hợp không tìm thấy tỷ lệ (vd: "N/A" hoặc "1 Lít/ Chai") -> Lấy số đơn giản ở đầu
    const simpleMatch = packagingStr.match(/^(\d+(\.\d+)?)/);
    if (simpleMatch) {
        return Math.round(Number(simpleMatch[1]));
    }
    
    return 1;
};

/**
 * --- HÀM MỚI ---
 * Chuẩn hóa chuỗi để tìm kiếm mờ (Fuzzy Search):
 * - Về chữ thường
 * - Bỏ dấu tiếng Việt
 * - Bỏ toàn bộ khoảng trắng
 */
export const fuzzyNormalize = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Bỏ dấu
        .replace(/\s+/g, ""); // Bỏ khoảng trắng
};
