const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// 1. Cấu hình
const serviceAccount = require('../serviceAccountKey.json');
const BACKUP_DIR = path.join(__dirname, '../backups'); 

// Danh sách collection
const COLLECTIONS_TO_BACKUP = [
    'products', 'product_summaries', 'inventory_lots', 'partners',
    'import_tickets', 'export_tickets', 'stocktakes', 'users', 'allowlist'
];

// --- HÀM KIỂM TRA MỚI ---
const shouldRunBackup = () => {
    // Tạo thư mục backup gốc nếu chưa có
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR);
        return true; // Chưa có thư mục gốc thì chắc chắn chưa backup -> Chạy
    }

    // Lấy ngày hôm nay (định dạng YYYY-MM-DD)
    // Lưu ý: Chỉnh theo múi giờ Việt Nam để chính xác
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); 
    const prefix = `backup_${today}`;

    // Đọc danh sách các thư mục đang có
    const existingBackups = fs.readdirSync(BACKUP_DIR);

    // Kiểm tra xem có thư mục nào bắt đầu bằng "backup_2025-11-20..." chưa
    const hasBackupToday = existingBackups.some(folder => folder.startsWith(prefix));

    if (hasBackupToday) {
        console.log(`🚫 HÔM NAY (${today}) ĐÃ CÓ BẢN BACKUP RỒI!`);
        console.log("   -> Hệ thống sẽ bỏ qua để tránh trùng lặp.");
        return false; // Không chạy nữa
    }

    return true; // Chưa có -> Chạy
};

// Khởi tạo Firebase
try {
    initializeApp({ credential: cert(serviceAccount) });
} catch (e) {
    if (e.code !== 'app/duplicate-app') process.exit(1);
}
const db = getFirestore();

// Hàm lấy thời gian cho tên file
const getTimestampString = () => {
    // Lấy giờ VN
    const now = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
    // Chuyển đổi format: 2025-11-20, 24:00:00 -> 2025-11-20_24-00-00
    return now.replace(', ', '_').replace(/:/g, '-');
};

const backupData = async () => {
    // 1. KIỂM TRA TRƯỚC KHI CHẠY
    if (!shouldRunBackup()) {
        // Nếu đã backup rồi thì thoát ngay lập tức
        process.exit(0);
    }

    const timestamp = getTimestampString();
    const currentBackupDir = path.join(BACKUP_DIR, `backup_${timestamp}`);
    
    if (!fs.existsSync(currentBackupDir)) fs.mkdirSync(currentBackupDir);

    console.log(`📦 Đang tạo bản backup mới: ${currentBackupDir}`);

    for (const collectionName of COLLECTIONS_TO_BACKUP) {
        try {
            console.log(`   ↳ Tải: ${collectionName}...`);
            const snapshot = await db.collection(collectionName).get();
            
            if (snapshot.empty) continue;

            const data = [];
            snapshot.forEach(doc => {
                data.push({ _id: doc.id, ...doc.data() });
            });

            const filePath = path.join(currentBackupDir, `${collectionName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error(`     ❌ Lỗi: ${collectionName}`, error.message);
        }
    }

    console.log(`🎉 ĐÃ SAO LƯU XONG!`);
};

backupData();