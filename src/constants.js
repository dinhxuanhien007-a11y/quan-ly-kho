/// src/constants.js

// --- THÊM MỚI ---
// Danh sách các nhóm hàng có quy tắc HSD đặc biệt (90 ngày)
export const SPECIAL_EXPIRY_SUBGROUPS = ["BD BDB", "BD DS"];
// -----------------

// Danh sách các Team chính của hệ thống
export const TEAM_OPTIONS = ["MED", "BIO"];

// <-- THÊM MỚI: Hằng số dùng chung cho việc phân trang
export const PAGE_SIZE = 15;

export const TEMP_OPTIONS = ["Nhiệt độ phòng", "2 → 8°C", "-25 → -15°C"];

export const MANUFACTURER_OPTIONS = ["Becton Dickinson", "Smiths Medical", "DentaLife", "Schulke", "Intra", "Rovers", "Corning", "Thermo Fisher", "Cytiva"];

export const UNIT_OPTIONS = ["Cái", "Hộp", "Thùng", "Chai", "Ống", "Lọ", "Sợi", "Cây", "Can", "Tuýp", "Bộ", "Máng", "Gói", "Khay"];

// Định nghĩa các nhóm hàng theo từng team
export const SUBGROUPS_BY_TEAM = {
    MED: [
        "BD MDS",
        "BD SM",
        "BD BDC",
        "BD BDI",
        "CVC",
        "DentaLife",
        "Schulke",
        "Smiths Medical",
        "Gojo",
        "Purell",
    ],
    BIO: [
        "BD BDB",
        "BD DS",
        "Spare Part", // "Spare Part" giờ là một nhóm hàng của BIO
        "Rovers",
        "KHÁC",
    ]
};

// Tự động tạo ra một mảng chứa tất cả các nhóm hàng
export const ALL_SUBGROUPS = [
    ...SUBGROUPS_BY_TEAM.MED,
    ...SUBGROUPS_BY_TEAM.BIO
].sort(); // Sắp xếp theo ABC