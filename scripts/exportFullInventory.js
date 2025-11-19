// Import các thư viện cần thiết
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const ExcelJS = require('exceljs');
const path = require('path');

// --- CẤU HÌNH ---
// 1. Đường dẫn đến file Service Account Key
const serviceAccount = require('../serviceAccountKey.json'); // Đặt ở thư mục gốc

// 2. Tên file Excel sẽ xuất ra
const outputFileName = 'BaoCao_TonKho_DAYDU.xlsx';
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
 * Hàm chính để tải toàn bộ sản phẩm và tồn kho (kể cả tồn = 0)
 */
const exportFullInventory = async () => {
  console.log('Bắt đầu quá trình xuất TOÀN BỘ tồn kho (kể cả tồn 0)...');

  try {
    // === 1. Tải TOÀN BỘ danh mục sản phẩm (Master List) ===
    console.log("Đang tải collection: products...");
    const productsRef = db.collection('products');
    const productsSnapshot = await productsRef.get();

    if (productsSnapshot.empty) {
      console.log('Không tìm thấy sản phẩm nào trong collection "products".');
      return;
    }
    console.log(`Tìm thấy ${productsSnapshot.size} mã sản phẩm (SKU) trong danh mục.`);

    // === 2. Tải TOÀN BỘ dữ liệu tồn kho tổng hợp ===
    console.log("Đang tải collection: product_summaries...");
    const summariesRef = db.collection('product_summaries');
    const summariesSnapshot = await summariesRef.get();

    // Tạo một Map để tra cứu tồn kho nhanh (Key: productId, Value: totalRemaining)
    const summaryMap = new Map();
    summariesSnapshot.forEach(doc => {
      summaryMap.set(doc.id, doc.data().totalRemaining);
    });
    console.log(`Đã tải ${summaryMap.size} mã hàng đang có tồn kho.`);

    // === 3. Xử lý và Hợp nhất dữ liệu ===
    const processedData = [];
    productsSnapshot.forEach(doc => {
      const product = doc.data();
      const productId = doc.id;

      // Tra cứu tồn kho. Nếu không tìm thấy trong Map, tồn kho là 0.
      const totalQuantity = summaryMap.get(productId) || 0;

      processedData.push({
        productId: productId,
        productName: product.productName,
        unit: product.unit,
        packaging: product.packaging,
        totalQuantity: totalQuantity, // Lấy tồn kho từ Map hoặc là 0
        storageTemp: product.storageTemp,
        manufacturer: product.manufacturer,
        subGroup: product.subGroup,
        team: product.team,
      });
    });

    console.log(`Đã xử lý xong ${processedData.length} mã sản phẩm. Đang tạo file Excel...`);

    // === 4. Tạo file Excel ===
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('TonKhoDayDu');

    // 5. Thiết lập tiêu đề cột (Headers)
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

    // 6. Thêm dữ liệu vào file
    // Sắp xếp theo Mã hàng trước khi thêm vào
    processedData.sort((a, b) => a.productId.localeCompare(b.productId));
    worksheet.addRows(processedData);

    // 7. Định dạng Header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF007BFF' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // 8. Định dạng các dòng dữ liệu
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        row.getCell('totalQuantity').alignment = { vertical: 'middle', horizontal: 'right' };
        row.getCell('productId').alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });

    // === 9. Ghi file ra đĩa ===
    await workbook.xlsx.writeFile(outputPath);
    
    console.log(`✅ HOÀN TẤT! Đã xuất thành công ${processedData.length} mã hàng (bao gồm cả tồn kho 0).`);
    console.log(`File đã được lưu tại: ${outputPath}`);

  } catch (error) {
    console.error('❌ LỖI: Đã xảy ra lỗi trong quá trình xuất file:');
    console.error(error);
  }
};

// Chạy hàm
exportFullInventory();