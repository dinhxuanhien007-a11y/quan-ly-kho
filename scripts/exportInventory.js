// Import các thư viện cần thiết
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const ExcelJS = require('exceljs');
const path = require('path');

// --- CẤU HÌNH ---
// Đường dẫn đến file Service Account Key
const serviceAccount = require('../serviceAccountKey.json'); // Giả sử bạn đặt nó ở thư mục gốc

// Tên file Excel sẽ xuất ra
const outputFileName = 'BaoCao_TonKho_HienTai.xlsx';
const outputPath = path.join(process.cwd(), outputFileName); // Lưu ở thư mục gốc
// ------------------

// Khởi tạo Firebase Admin
try {
  initializeApp({
    credential: cert(serviceAccount)
  });
} catch (e) {
  if (e.code !== 'app/duplicate-app') {
    console.error('Lỗi khởi tạo Firebase Admin:', e);
    process.exit(1);
  }
}

const db = getFirestore();

/**
 * Hàm chính để tải và xuất dữ liệu
 */
const exportInventory = async () => {
  console.log('Bắt đầu quá trình xuất tồn kho...');

  try {
    // === 1. Tải dữ liệu từ Firestore ===
    console.log("Đang tải dữ liệu từ collection 'inventory_lots' (chỉ lấy lô còn tồn kho)...");
    const lotsCollectionRef = db.collection('inventory_lots');
    const lotsQuery = lotsCollectionRef.where('quantityRemaining', '>', 0);
    const lotsSnapshot = await lotsQuery.get();

    if (lotsSnapshot.empty) {
      console.log('Không tìm thấy lô hàng nào còn tồn kho.');
      return;
    }
    console.log(`Tìm thấy ${lotsSnapshot.size} lô hàng còn tồn kho. Đang tổng hợp...`);

    // === 2. Tổng hợp (Aggregate) dữ liệu ===
    // Chúng ta sẽ gom các lô lại theo productId
    const inventoryMap = new Map();

    lotsSnapshot.forEach(doc => {
      const lot = doc.data();
      const key = lot.productId;

      if (inventoryMap.has(key)) {
        // Nếu đã có, cộng dồn số lượng
        const existing = inventoryMap.get(key);
        existing.totalQuantity += lot.quantityRemaining;
      } else {
        // Nếu chưa có, tạo mục mới
        inventoryMap.set(key, {
          productId: lot.productId,
          productName: lot.productName,
          unit: lot.unit,
          packaging: lot.packaging,
          storageTemp: lot.storageTemp,
          manufacturer: lot.manufacturer,
          subGroup: lot.subGroup,
          team: lot.team,
          totalQuantity: lot.quantityRemaining // Khởi tạo số lượng
        });
      }
    });

    // Chuyển Map thành mảng
    const processedData = Array.from(inventoryMap.values());
    console.log(`Đã tổng hợp ${processedData.length} mã sản phẩm (SKU).`);

    // === 3. Tạo file Excel ===
    console.log('Đang tạo file Excel...');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('TongHopTonKho');

    // 4. Thiết lập tiêu đề cột (Headers)
    worksheet.columns = [
      { header: 'Mã hàng', key: 'productId', width: 20 },
      { header: 'Tên hàng', key: 'productName', width: 45 },
      { header: 'ĐVT', key: 'unit', width: 10 },
      { header: 'Quy cách', key: 'packaging', width: 30 },
      { header: 'Số lượng tồn', key: 'totalQuantity', width: 15, style: { numFmt: '#,##0' } },
      { header: 'Nhiệt độ BQ', key: 'storageTemp', width: 20 },
      { header: 'Hãng sản xuất', key: 'manufacturer', width: 25 },
      { header: 'Nhóm hàng', key: 'subGroup', width: 20 },
      { header: 'Team', key: 'team', width: 10 }
    ];

    // 5. Thêm dữ liệu vào file
    worksheet.addRows(processedData);

    // 6. Định dạng Header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF007BFF' } // Màu xanh dương
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // 7. Định dạng các dòng dữ liệu
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        // Căn phải cho cột số lượng
        row.getCell('totalQuantity').alignment = { vertical: 'middle', horizontal: 'right' };
      }
    });
    
    // === 8. Ghi file ra đĩa ===
    await workbook.xlsx.writeFile(outputPath);
    
    console.log(`✅ HOÀN TẤT! Đã xuất thành công ${processedData.length} mã hàng.`);
    console.log(`File đã được lưu tại: ${outputPath}`);

  } catch (error) {
    console.error('❌ LỖI: Đã xảy ra lỗi trong quá trình xuất file:');
    console.error(error);
  }
};

// Chạy hàm
exportInventory();