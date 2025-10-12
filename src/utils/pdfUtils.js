// src/utils/pdfUtils.js
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from './dateUtils';
import { formatNumber } from './numberUtils';
import { toast } from 'react-toastify';
import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

// --- Hàm tiện ích dùng chung ---
const fontToBase64 = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Network response was not ok, status: ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const reformatDateString = (dateString) => {
    if (typeof dateString !== 'string' || !dateString.trim()) return '...';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// --- Hàm thiết lập PDF với font chữ và khổ giấy ---
const setupPdfDoc = async (orientation = 'portrait') => {
    const doc = new jsPDF({ orientation });
    try {
        const [robotoRegularBase64, robotoBoldBase64] = await Promise.all([
            fontToBase64('/fonts/Roboto-Regular.ttf'),
            fontToBase64('/fonts/Roboto-Bold.ttf')
        ]);
        doc.addFileToVFS('Roboto-Regular.ttf', robotoRegularBase64);
        doc.addFont('Roboto-Regular.ttf', 'Roboto-Regular', 'normal');
        doc.addFileToVFS('Roboto-Bold.ttf', robotoBoldBase64);
        doc.addFont('Roboto-Bold.ttf', 'Roboto-Regular', 'bold');
        doc.setFont('Roboto-Regular');
        return doc;
    } catch (error) {
        console.error("Lỗi khi tải font chữ:", error);
        toast.error("Không thể tải font chữ để xuất PDF.");
        return null;
    }
};

// --- Hàm lấy thông tin sản phẩm ---
const getProductDetailsForItems = async (items) => {
    const productPromises = items.map(item => getDoc(doc(db, 'products', item.productId)));
    const productSnapshots = await Promise.all(productPromises);
    
    const productDetailsMap = productSnapshots.reduce((acc, docSnap) => {
        if (docSnap.exists()) {
            acc[docSnap.id] = docSnap.data();
        }
        return acc;
    }, {});

    return items.map(item => {
        const details = productDetailsMap[item.productId] || {};
        return {
            ...item,
            unit: details.unit || '',
            specification: details.packaging || '',
            storageTemp: details.storageTemp || '',
        };
    });
};

// --- HÀM XUẤT PHIẾU NHẬP (ĐÃ NÂNG CẤP) ---
export const exportImportSlipToPDF = async (slip) => {
    const doc = await setupPdfDoc('landscape');
    if (!doc) return;

    const enrichedItems = await getProductDetailsForItems(slip.items);

    doc.setFontSize(18);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text('PHIẾU NHẬP KHO', 148, 20, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('Roboto-Regular', 'normal');
    const slipDate = slip.createdAt ? formatDate(slip.createdAt.toDate()) : 'Không có';
    doc.text(`Ngày lập phiếu: ${slipDate}`, 14, 30);
    doc.text(`Mã phiếu: ${slip.id}`, 283, 30, { align: 'right' });
    
    // Yêu cầu 4: Tô đậm tên đối tác
    doc.setFont('Roboto-Regular', 'normal');
    doc.text(`Nhà cung cấp: `, 14, 36);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text(slip.supplierName || '', 40, 36);
    
    doc.setFont('Roboto-Regular', 'normal');
    doc.text(`Ghi chú: ${slip.description || 'Không có'}`, 14, 42);

    const head = [['Mã hàng', 'Tên sản phẩm', 'Số lô', 'HSD', 'ĐVT', 'Quy cách', 'Số lượng', 'Ghi chú', 'Team']];
    const body = enrichedItems.map(item => [
        item.productId, item.productName, item.lotNumber, item.expiryDate,
        item.unit, item.specification, formatNumber(item.quantity),
        item.notes || '', item.team || ''
    ]);

    autoTable(doc, {
        head: head, body: body, startY: 50, theme: 'grid', margin: { left: 10, right: 10 },
        // Yêu cầu 1 & 2: Căn giữa mặc định
        styles: { font: 'Roboto-Regular', fontSize: 11, halign: 'center', valign: 'middle' },
        headStyles: { font: 'Roboto-Regular', fontStyle: 'bold', fillColor: [22, 160, 133], textColor: 255, halign: 'center' },
        // Yêu cầu 3: Điều chỉnh độ rộng cột
        columnStyles: {
            0: { cellWidth: 31 },  // Mã hàng
            1: { cellWidth: 71, halign: 'left' }, // Tên sản phẩm (rộng, căn trái)
            2: { cellWidth: 31 },  // Số lô
            3: { cellWidth: 26 },  // HSD (hẹp)
            4: { cellWidth: 18 },  // ĐVT (hẹp)
            5: { cellWidth: 35 },  // Quy cách (hẹp)
            6: { cellWidth: 25 },  // Số lượng (hẹp)
            7: { cellWidth: 'auto' }, // Ghi chú (tự động co giãn)
            8: { cellWidth: 25 },  // Team (hẹp)
        },
        // Yêu cầu 4: Tô đậm các ô được chỉ định
        didParseCell: function (data) {
            const boldColumns = [0, 2, 6]; // Mã hàng, Số lô, Số lượng
            if (data.section === 'body' && boldColumns.includes(data.column.index)) {
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });
    
    // Yêu cầu 5: Loại bỏ phần ký tên
    // Không thêm code cho phần ký tên nữa

    doc.save(`PhieuNhapKho_${slip.id}.pdf`);
};

// --- HÀM XUẤT PHIẾU XUẤT (ĐÃ NÂNG CẤP) ---
export const exportExportSlipToPDF = async (slip) => {
    const doc = await setupPdfDoc('landscape');
    if (!doc) return;

    const enrichedItems = await getProductDetailsForItems(slip.items);

    doc.setFontSize(18);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text('PHIẾU XUẤT KHO', 148, 20, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('Roboto-Regular', 'normal');
    const slipDate = slip.createdAt ? formatDate(slip.createdAt.toDate()) : 'Không có';
    doc.text(`Ngày lập phiếu: ${slipDate}`, 14, 30);
    doc.text(`Mã phiếu: ${slip.id}`, 283, 30, { align: 'right' });

    // Yêu cầu 4: Tô đậm tên đối tác
    doc.setFont('Roboto-Regular', 'normal');
    doc.text(`Khách hàng: `, 14, 36);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text(slip.customer || '', 36, 36);
    
    doc.setFont('Roboto-Regular', 'normal');
    doc.text(`Ghi chú: ${slip.description || 'Không có'}`, 14, 42);

    const head = [['Mã hàng', 'Tên sản phẩm', 'Số lô', 'HSD', 'ĐVT', 'Quy cách', 'Số lượng', 'Ghi chú', 'Nhiệt độ BQ']];
    const body = enrichedItems.map(item => [
        item.productId, item.productName, item.lotNumber, item.expiryDate,
        item.unit, item.specification,
        formatNumber(item.quantity || item.quantityToExport || item.quantityExported || 0),
        item.notes || '', item.storageTemp
    ]);

    // File: src/utils/pdfUtils.js (bên trong hàm exportExportSlipToPDF)

    autoTable(doc, {
        head, body, startY: 50, theme: 'grid', margin: { left: 1, right: 1 }, // <-- THAY ĐỔI Ở ĐÂY
        styles: { font: 'Roboto-Regular', fontSize: 11, halign: 'center', valign: 'middle' },
        headStyles: { font: 'Roboto-Regular', fontStyle: 'bold', fillColor: [22, 160, 133], textColor: 255, halign: 'center' },
        columnStyles: {
            0: { cellWidth: 31 },
            1: { cellWidth: 71, halign: 'left' },
            2: { cellWidth: 31 },
            3: { cellWidth: 26 },
            4: { cellWidth: 18 },
            5: { cellWidth: 35 },
            6: { cellWidth: 25 },
            7: { cellWidth: 'auto' },
            8: { cellWidth: 25 },
        },
        didParseCell: function (data) {
            const boldColumns = [0, 2, 6];
            if (data.section === 'body' && boldColumns.includes(data.column.index)) {
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });
    
    // Yêu cầu 5: Loại bỏ phần ký tên
    // Không thêm code cho phần ký tên nữa

    doc.save(`PhieuXuatKho_${slip.id}.pdf`);
};

// Dán vào file: src/utils/pdfUtils.js

export const exportStocktakeToPDF = async (session, items) => {
    const doc = await setupPdfDoc('landscape');
    if (!doc) return;

    doc.setFontSize(18);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text('PHIẾU KIỂM KÊ KHO', 148, 15, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('Roboto-Regular', 'normal');
    const sessionDate = session.createdAt ? formatDate(session.createdAt.toDate()) : formatDate(new Date());
    doc.text(`Ngày tạo: ${sessionDate}`, 14, 25);
    doc.text(`Mã phiên: ${session.id}`, 283, 25, { align: 'right' });
    doc.text(`Ghi chú phiên: ${session.notes || 'Không có'}`, 14, 31);

    // --- SỬA LỖI: Bỏ cột STT khỏi tiêu đề ---
    const head = [['Mã hàng', 'Tên sản phẩm', 'Số lô', 'HSD', 'ĐVT', 'Quy cách', 'Nhiệt độ BQ', 'Tồn kho HT', 'Tồn kho TT', 'Ghi chú']];
    
    // --- SỬA LỖI: Bỏ cột STT khỏi nội dung ---
    const body = items.map(item => [
        item.productId,
        item.productName,
        item.lotNumber,
        item.expiryDate ? formatDate(item.expiryDate.toDate()) : 'N/A',
        item.unit,
        item.packaging,
        item.storageTemp || 'N/A',
        formatNumber(item.systemQty || item.expectedQuantity),
        '', 
        ''
    ]);

    autoTable(doc, {
        head: head,
        body: body,
        startY: 40,
        theme: 'grid',
        margin: { left: 10, right: 10 },
        styles: { font: 'Roboto-Regular', fontSize: 11, valign: 'middle', halign: 'center' },
        headStyles: { font: 'Roboto-Regular', fontStyle: 'bold', fillColor: [22, 160, 133], textColor: 255 },
        // --- SỬA LỖI: Cập nhật lại chỉ số các cột ---
        columnStyles: {
            0: { cellWidth: 27 },  // Mã hàng
            1: { cellWidth: 71, halign: 'left' }, // Tên sản phẩm
            2: { cellWidth: 27 },  // Số lô
            3: { cellWidth: 27 },  // HSD
            4: { cellWidth: 16 },  // ĐVT
            5: { cellWidth: 31 },  // Quy cách
            6: { cellWidth: 21 },  // Nhiệt độ BQ
            7: { cellWidth: 21, halign: 'center' }, // Tồn kho HT
            8: { cellWidth: 21 },  // Tồn kho TT
            9: { cellWidth: 'auto', halign: 'left' }, // Ghi chú
        },
        didParseCell: function (data) {
            // Cập nhật lại chỉ số cột cần in đậm
            if (data.section === 'body' && data.column.index === 7) {
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    const finalY = doc.lastAutoTable.finalY + 20;
    doc.text('Người kiểm kê', 50, finalY, { align: 'center' });
    doc.text('Thủ kho', 247, finalY, { align: 'center' });

    doc.save(`PhieuKiemKe_${session.id}.pdf`);
};

// --- Hàm xuất Sổ vật tư (giữ nguyên không đổi) ---
export const exportLedgerToPDF = async (productInfo, ledgerData, tableRows, filters) => {
    const doc = await setupPdfDoc('portrait'); // Sổ kho vẫn in dọc
    if (!doc) return;
    
    // ... nội dung còn lại của hàm này giữ nguyên ...
    
    doc.setFontSize(18);
    doc.text('SỔ CHI TIẾT VẬT TƯ (THẺ KHO)', 105, 20, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`Sản phẩm: ${productInfo.productName || ''} (${productInfo.id || ''})`, 14, 30);
    doc.text(`Đơn vị tính: ${productInfo.unit || ''}`, 14, 36);
    const dateRange = (filters.startDate || filters.endDate) 
        ? `Từ ngày: ${reformatDateString(filters.startDate)} - Đến ngày: ${reformatDateString(filters.endDate)}`
        : 'Toàn bộ thời gian';
    doc.text(dateRange, 196, 36, { align: 'right' });

    const head = [['Ngày', 'Chứng từ', 'Loại', 'Diễn giải', 'Số lô', 'Nhập', 'Xuất', 'Tồn']];
    const body = tableRows.map(row => [
        formatDate(row.date), row.docId || '', row.type || '', row.description || '',
        row.lotNumber || '', row.importQty > 0 ? formatNumber(row.importQty) : '',
        row.exportQty > 0 ? formatNumber(row.exportQty) : '', formatNumber(row.balance)
    ]);
    body.unshift([
        { content: `Tồn đầu kỳ:`, colSpan: 7, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: formatNumber(ledgerData.openingBalance), styles: { fontStyle: 'bold' } }
    ]);

    autoTable(doc, {
        head: head, body: body, startY: 42, theme: 'grid',
        styles: { font: 'Roboto-Regular', fontSize: 8, halign: 'center' },
        headStyles: { font: 'Roboto-Regular', fillColor: [22, 160, 133], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { font: 'Roboto-Regular' },
        columnStyles: {
            0: { cellWidth: 20 },      
            1: { cellWidth: 25, halign: 'left' },
            2: { cellWidth: 'auto' },  
            3: { cellWidth: 60, halign: 'left' },
            4: { cellWidth: 25 },      
            5: { halign: 'right' },    
            6: { halign: 'right' },    
            7: { halign: 'right', fontStyle: 'bold' },
        },
        didDrawPage: (data) => {
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.text('Trang ' + String(data.pageNumber) + ' / ' + pageCount, data.settings.margin.left, doc.internal.pageSize.height - 10);
        }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text('TỔNG KẾT CUỐI KỲ:', 14, finalY);
    doc.setFont('Roboto-Regular', 'normal');
    doc.text(`Tổng Nhập: ${formatNumber(ledgerData.totalImport)}`, 14, finalY + 6);
    doc.text(`Tổng Xuất: ${formatNumber(ledgerData.totalExport)}`, 14, finalY + 12);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text(`Tồn cuối kỳ: ${formatNumber(ledgerData.closingBalance)}`, 14, finalY + 18);

    const fileName = `SoKho_${productInfo.id}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
};
