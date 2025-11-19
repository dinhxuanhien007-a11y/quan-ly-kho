// src/utils/excelExportUtils.js
import ExcelJS from 'exceljs';
import { collection, getDocs, query, orderBy, documentId, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { formatDate, getRowColorByExpiry } from './dateUtils';

export const exportFullInventoryToExcel = async () => {
  // 1. Khởi tạo Workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('TonKhoChiTiet');

  // 2. Định nghĩa cột
  worksheet.columns = [
    { header: 'Mã hàng', key: 'productId', width: 20 },
    { header: 'Tên hàng', key: 'productName', width: 40 },
    { header: 'Số lô', key: 'lotNumber', width: 18 },
    { header: 'Hạn sử dụng', key: 'expiryDate', width: 15 },
    { header: 'Số lượng', key: 'quantity', width: 15, style: { numFmt: '#,##0' } },
    { header: 'ĐVT', key: 'unit', width: 10 },
    { header: 'Quy cách', key: 'packaging', width: 25 },
    { header: 'Nhiệt độ BQ', key: 'storageTemp', width: 20 },
    { header: 'Hãng sản xuất', key: 'manufacturer', width: 25 },
    { header: 'Nhóm hàng', key: 'subGroup', width: 15 },
    { header: 'Team', key: 'team', width: 10 },
  ];

  // Tạo bộ lọc cho dòng tiêu đề
  worksheet.autoFilter = 'A1:K1';

  // Định dạng Header
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF007BFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  try {
    // 3. Tải dữ liệu
    const productsRef = collection(db, 'products');
    const productsQuery = query(productsRef, orderBy(documentId()));
    
    const lotsRef = collection(db, 'inventory_lots');
    const lotsQuery = query(lotsRef, where('quantityRemaining', '>', 0));

    const [productsSnap, lotsSnap] = await Promise.all([
      getDocs(productsQuery),
      getDocs(lotsQuery)
    ]);

    // 4. GOM NHÓM VÀ CỘNG DỒN SỐ LƯỢNG (LOGIC MỚI)
    // Map: productId -> Map: lotKey -> LotData (đã cộng dồn)
    const productLotsMap = new Map();

    lotsSnap.forEach(doc => {
        const lot = doc.data();
        const productId = lot.productId;
        // Tạo key duy nhất cho lô: Mã hàng + Số lô + HSD (để tránh gộp nhầm các lô trùng số nhưng khác date)
        // Nếu không có số lô, dùng 'NO_LOT'. Nếu không có date, dùng 'NO_DATE'
        const lotNumber = lot.lotNumber ? lot.lotNumber.trim() : 'NO_LOT';
        const expiryTime = lot.expiryDate ? lot.expiryDate.toMillis() : 'NO_DATE';
        const uniqueLotKey = `${lotNumber}_${expiryTime}`;

        if (!productLotsMap.has(productId)) {
            productLotsMap.set(productId, new Map());
        }

        const lotsOfProduct = productLotsMap.get(productId);

        if (lotsOfProduct.has(uniqueLotKey)) {
            // Nếu đã có lô này, cộng dồn số lượng tồn
            const existingLot = lotsOfProduct.get(uniqueLotKey);
            existingLot.quantityRemaining += lot.quantityRemaining;
        } else {
            // Nếu chưa có, thêm mới (sao chép dữ liệu để không ảnh hưởng gốc)
            lotsOfProduct.set(uniqueLotKey, { ...lot });
        }
    });

    // 5. Duyệt qua từng sản phẩm và xuất dòng
    productsSnap.forEach(doc => {
      const product = doc.data();
      const productId = doc.id;
      
      // Lấy danh sách các lô đã gộp của sản phẩm này
      const aggregatedLotsMap = productLotsMap.get(productId);
      
      if (aggregatedLotsMap && aggregatedLotsMap.size > 0) {
          // Chuyển Map thành mảng để sắp xếp
          const sortedLots = Array.from(aggregatedLotsMap.values()).sort((a, b) => {
               // Sắp xếp FEFO (HSD gần nhất lên trước)
               const dateA = a.expiryDate ? a.expiryDate.toDate().getTime() : Infinity;
               const dateB = b.expiryDate ? b.expiryDate.toDate().getTime() : Infinity;
               return dateA - dateB;
          });

          // Xuất từng lô (đã cộng dồn)
          sortedLots.forEach(lot => {
              addRowToSheet(worksheet, product, productId, lot);
          });
      } else {
          // Sản phẩm hết hàng
          addRowToSheet(worksheet, product, productId, null);
      }
    });

    // 6. Xuất file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `TonKhoChiTiet_${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error("Lỗi xuất Excel:", error);
    throw error;
  }
};

// --- Hàm phụ trợ để thêm dòng và định dạng ---
const addRowToSheet = (worksheet, product, productId, lot) => {
    const expiryDateObj = lot?.expiryDate ? lot.expiryDate : null;
    const quantity = lot ? lot.quantityRemaining : 0;
    const lotNumber = lot ? (lot.lotNumber || '') : '';
    
    const colorClass = getRowColorByExpiry(expiryDateObj, product.subGroup);
    
    let rowBackgroundColor = null;
    let fontColor = 'FF000000';

    if (quantity > 0) { 
        if (colorClass.includes('expired-black')) {
            rowBackgroundColor = 'FF212529'; 
            fontColor = 'FFFFFFFF';          
        } else if (colorClass.includes('near-expiry-red')) {
            rowBackgroundColor = 'FFF8D7DA'; 
        } else if (colorClass.includes('near-expiry-orange')) {
            rowBackgroundColor = 'FFFFE8CC'; 
        } else if (colorClass.includes('near-expiry-yellow')) {
            rowBackgroundColor = 'FFFFF3CD'; 
        }
    }

    const rowData = {
      productId: productId,
      productName: product.productName,
      lotNumber: lotNumber,                 
      expiryDate: expiryDateObj ? formatDate(expiryDateObj) : '', 
      quantity: quantity,                   
      unit: product.unit,
      packaging: product.packaging,
      storageTemp: product.storageTemp,
      manufacturer: product.manufacturer,
      subGroup: product.subGroup,
      team: product.team
    };

    const newRow = worksheet.addRow(rowData);

    newRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      
      let alignHoriz = 'center'; 
      if (cell._address.startsWith('B')) alignHoriz = 'left'; 
      cell.alignment = { vertical: 'middle', horizontal: alignHoriz, wrapText: true };

      let isBold = false;
      if (cell._address.startsWith('A') || cell._address.startsWith('E')) isBold = true;
      cell.font = { bold: isBold, color: { argb: fontColor } };

      if (rowBackgroundColor) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBackgroundColor } };
      }
    });
};