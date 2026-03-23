// src/utils/pdfUtils.js
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from './dateUtils';
import { formatNumber } from './numberUtils';
import { toast } from 'react-toastify';
import { db } from '../firebaseConfig';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';

// --- Hàm tiá»‡n ích dùng chung ---
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

// --- Hàm thiáº¿t láº­p PDF vá»›i font chá»¯ và khá»• giáº¥y ---
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
        console.error("Lá»—i khi táº£i font chá»¯:", error);
        toast.error("Không thá»ƒ táº£i font chá»¯ đá»ƒ xuáº¥t PDF.");
        return null;
    }
};

// --- Hàm láº¥y thông tin sản phẩm ---
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

// --- HÃ€M XUáº¤T PHIáº¾U NHáº¬P (ĐÃƒ NÃ‚NG Cáº¤P) ---
export const exportImportSlipToPDF = async (slip) => {
    const doc = await setupPdfDoc('landscape');
    if (!doc) return;

    const enrichedItems = await getProductDetailsForItems(slip.items);

    doc.setFontSize(18);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text('PHIáº¾U NHáº¬P KHO', 148, 20, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('Roboto-Regular', 'normal');
    const slipDate = slip.createdAt ? formatDate(slip.createdAt.toDate()) : 'Không có';
    doc.text(`Ngày láº­p phiáº¿u: ${slipDate}`, 14, 30);
    doc.text(`Mã phiếu: ${slip.id}`, 283, 30, { align: 'right' });
    
    // Yêu cáº§u 4: Tô đáº­m tên đối tác
    doc.setFont('Roboto-Regular', 'normal');
    doc.text(`Nhà cung cáº¥p: `, 14, 36);
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
        // Yêu cáº§u 1 & 2: CÄƒn giá»¯a máº·c đá»‹nh
        styles: { font: 'Roboto-Regular', fontSize: 11, halign: 'center', valign: 'middle' },
        headStyles: { font: 'Roboto-Regular', fontStyle: 'bold', fillColor: [22, 160, 133], textColor: 255, halign: 'center' },
        // Yêu cáº§u 3: Điá»u chá»‰nh độ rộng cột
        columnStyles: {
            0: { cellWidth: 31 },  // Mã hàng
            1: { cellWidth: 71, halign: 'left' }, // Tên sản phẩm (rộng, cÄƒn trái)
            2: { cellWidth: 31 },  // Số lô
            3: { cellWidth: 26 },  // HSD (háº¹p)
            4: { cellWidth: 18 },  // ĐVT (háº¹p)
            5: { cellWidth: 35 },  // Quy cách (háº¹p)
            6: { cellWidth: 25 },  // Số lượng (háº¹p)
            7: { cellWidth: 'auto' }, // Ghi chú (tá»± động co giãn)
            8: { cellWidth: 25 },  // Team (háº¹p)
        },
        // Yêu cáº§u 4: Tô đáº­m các ô đÆ°á»£c chá»‰ đá»‹nh
        didParseCell: function (data) {
            const boldColumns = [0, 2, 6]; // Mã hàng, Số lô, Số lượng
            if (data.section === 'body' && boldColumns.includes(data.column.index)) {
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });
    
    // Yêu cáº§u 5: Loáº¡i bá» pháº§n ký tên
    // Không thêm code cho pháº§n ký tên ná»¯a

    doc.save(`PhieuNhapKho_${slip.id}.pdf`);
};

// --- HÃ€M XUáº¤T PHIáº¾U XUáº¤T (ĐÃƒ Sá»¬A LồI Gá»˜P DÃ'NG) ---
export const exportExportSlipToPDF = async (slip) => {
    const doc = await setupPdfDoc('landscape');
    if (!doc) return;

    // 1. Láº¥y thông tin chi tiáº¿t (ĐVT, Quy cách...) cho tá»«ng item
    const rawItems = await getProductDetailsForItems(slip.items);

    // === Báº®T Đáº¦U Sá»¬A ĐỗI: Gá»˜P CÁC DÃ'NG CÃ™NG MÃƒ + CÃ™NG Sá» LÃ" ===
    const aggregator = new Map();

    for (const item of rawItems) {
        // Táº¡o key duy nháº¥t: Mã hàng + Số lô
        // (Náº¿u lotNumber null/undefined thì dùng chuá»—i rá»—ng đá»ƒ tránh lá»—i)
        const safeLotNumber = item.lotNumber ? item.lotNumber.trim() : '';
        const key = `${item.productId}-${safeLotNumber}`;
        
        // Láº¥y số lượng (xá»­ lý các tên biáº¿n khác nhau có thá»ƒ có)
        const quantity = Number(item.quantity || item.quantityToExport || item.quantityExported || 0);

        if (aggregator.has(key)) {
            // Náº¿u đã có trong Map -> Cộng dổn số lượng
            const existingItem = aggregator.get(key);
            existingItem.totalQuantity += quantity;
        } else {
            // Náº¿u chÆ°a có -> Thêm má»›i vào Map
            // LÆ°u ý: Táº¡o trÆ°á»ng má»›i totalQuantity đá»ƒ chá»©a tá»•ng
            aggregator.set(key, { 
                ...item, 
                totalQuantity: quantity 
            });
        }
    }

    // Chuyá»ƒn Map thành Máº£ng đá»ƒ in ra PDF
    const aggregatedItems = Array.from(aggregator.values());
    // === Káº¾T THÃšC Sá»¬A ĐỗI ===

    doc.setFontSize(18);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text('PHIáº¾U XUáº¤T KHO', 148, 20, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('Roboto-Regular', 'normal');
    const slipDate = slip.createdAt ? formatDate(slip.createdAt.toDate()) : 'Không có';
    doc.text(`Ngày láº­p phiáº¿u: ${slipDate}`, 14, 30);
    doc.text(`Mã phiếu: ${slip.id}`, 283, 30, { align: 'right' });

    doc.setFont('Roboto-Regular', 'normal');
    doc.text(`Khách hàng: `, 14, 36);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text(slip.customer || '', 36, 36);
    
    doc.setFont('Roboto-Regular', 'normal');
    doc.text(`Ghi chú: ${slip.description || 'Không có'}`, 14, 42);

    const head = [['Mã hàng', 'Tên sản phẩm', 'Số lô', 'HSD', 'ĐVT', 'Quy cách', 'Số lượng', 'Ghi chú', 'Nhiệt độ BQ']];
    
    // Sá»­ dá»¥ng aggregatedItems thay vì enrichedItems (rawItems)
    const body = aggregatedItems.map(item => [
        item.productId, 
        item.productName, 
        item.lotNumber, 
        item.expiryDate,
        item.unit, 
        item.specification,
        formatNumber(item.totalQuantity), // Sá»­ dá»¥ng số lượng đã cộng dổn
        item.notes || '', 
        item.storageTemp
    ]);

    autoTable(doc, {
        head, body, startY: 50, theme: 'grid', margin: { left: 1, right: 1 },
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
    
    doc.save(`PhieuXuatKho_${slip.id}.pdf`);
};

// Dán vào file: src/utils/pdfUtils.js

export const exportStocktakeToPDF = async (session, items) => {
    const doc = await setupPdfDoc('landscape');
    if (!doc) return;

    // Load hệ số quy đổi Misa từ products
    const convMap = {};
    try {
        const prodsSnap = await getDocs(collection(db, 'products'));
        prodsSnap.forEach(docSnap => {
            const d = docSnap.data();
            const f = Number(d.misaConversionFactor);
            if (f && f !== 1) {
                convMap[docSnap.id] = { factor: f, misaUnit: d.misaUnit || '' };
            }
        });
    } catch (e) {
        console.warn('Không thể load convMap cho PDF:', e);
    }

    doc.setFontSize(16);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text('PHIẾU KIỂM KÊ KHO', 148, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('Roboto-Regular', 'normal');
    const sessionDate = session.createdAt ? formatDate(session.createdAt.toDate()) : formatDate(new Date());
    doc.text(`Ngày tạo: ${sessionDate}`, 14, 25);
    doc.text(`Mã phiên: ${session.id}`, 292, 25, { align: 'right' });
    doc.text(`Ghi chú phiên: ${session.notes || 'Không có'}`, 14, 31);

    const head = [['Mã hàng', 'Tên sản phẩm', 'Số lô', 'HSD', 'ĐVT', 'Quy cách', 'Nhiệt độ BQ', 'Tồn kho HT', 'Tồn Misa', 'Tồn kho TT', 'Nhóm Hàng', 'Ghi chú']];

    const body = items.map(item => {
        const conv = convMap[item.productId];
        const misaQty = conv
            ? ((item.systemQty || 0) * conv.factor).toLocaleString('vi-VN') + (conv.misaUnit ? ' ' + conv.misaUnit : '')
            : '';
        return [
            item.productId,
            item.productName,
            item.lotNumber || '(Không có)',
            item.expiryDate ? formatDate(item.expiryDate.toDate ? item.expiryDate.toDate() : item.expiryDate) : 'N/A',
            item.unit,
            item.packaging,
            item.storageTemp || 'N/A',
            formatNumber(item.systemQty || 0),
            misaQty,
            item.countedQty !== null && item.countedQty !== undefined ? formatNumber(item.countedQty) : '',
            item.subGroup || '',
            item.notes || ''
        ];
    });

    autoTable(doc, {
        head: head,
        body: body,
        startY: 38,
        theme: 'grid',
        margin: { left: 5, right: 5 },
        styles: { font: 'Roboto-Regular', fontSize: 9, valign: 'middle', halign: 'center' },
        headStyles: { font: 'Roboto-Regular', fontStyle: 'bold', fillColor: [22, 160, 133], textColor: 255, fontSize: 9 },
        columnStyles: {
            0:  { cellWidth: 22 },                   // Mã hàng
            1:  { cellWidth: 55, halign: 'left' },   // Tên sản phẩm
            2:  { cellWidth: 22 },                   // Số lô
            3:  { cellWidth: 22 },                   // HSD
            4:  { cellWidth: 12 },                   // ĐVT
            5:  { cellWidth: 28 },                   // Quy cách
            6:  { cellWidth: 18 },                   // Nhiệt độ BQ
            7:  { cellWidth: 18 },                   // Tồn kho HT
            8:  { cellWidth: 20 },                   // Tồn Misa (quy đổi)
            9:  { cellWidth: 18 },                   // Tồn kho TT
            10: { cellWidth: 18 },                   // Nhóm Hàng
            11: { cellWidth: 34, halign: 'left' },   // Ghi chú
        },
        didParseCell: function (data) {
            // In đậm Tồn kho HT (col 7) và Tồn kho TT (col 9)
            if (data.section === 'body' && data.column.index === 7) {
                data.cell.styles.fontStyle = 'bold';
            }
            if (data.section === 'body' && data.column.index === 9 && data.cell.raw !== '') {
                data.cell.styles.fontStyle = 'bold';
            }
            // In đậm + màu xanh cho Tồn Misa (col 8) nếu có giá trị
            if (data.section === 'body' && data.column.index === 8 && data.cell.raw !== '') {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [26, 115, 232];
            }
        }
    });

    const finalY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(10);
    doc.text('Người kiểm kê', 60, finalY, { align: 'center' });
    doc.text('Thủ kho', 237, finalY, { align: 'center' });

    doc.save(`PhieuKiemKe_${session.id}.pdf`);
};

// --- Hàm xuáº¥t Sá»• váº­t tÆ° (giá»¯ nguyên không đá»•i) ---
export const exportLedgerToPDF = async (productInfo, ledgerData, tableRows, filters) => {
    const doc = await setupPdfDoc('portrait'); // Sá»• kho váº«n in dá»c
    if (!doc) return;
    
    // ... nội dung còn láº¡i cá»§a hàm này giá»¯ nguyên ...
    
    doc.setFontSize(18);
    doc.text('Sỗ CHI TIáº¾T Váº¬T TÆ¯ (THáºº KHO)', 105, 20, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`Sáº£n pháº©m: ${productInfo.productName || ''} (${productInfo.id || ''})`, 14, 30);
    doc.text(`ĐÆ¡n vá»‹ tính: ${productInfo.unit || ''}`, 14, 36);
    const dateRange = (filters.startDate || filters.endDate) 
        ? `Tá»« ngày: ${reformatDateString(filters.startDate)} - Đáº¿n ngày: ${reformatDateString(filters.endDate)}`
        : 'Toàn bộ thá»i gian';
    doc.text(dateRange, 196, 36, { align: 'right' });

    const head = [['Ngày', 'Chá»©ng tá»«', 'Loáº¡i', 'Diá»…n giáº£i', 'Số lô', 'Nháº­p', 'Xuáº¥t', 'Tổn']];
    const body = tableRows.map(row => [
        formatDate(row.date), row.docId || '', row.type || '', row.description || '',
        row.lotNumber || '', row.importQty > 0 ? formatNumber(row.importQty) : '',
        row.exportQty > 0 ? formatNumber(row.exportQty) : '', formatNumber(row.balance)
    ]);
    body.unshift([
        { content: `Tổn đáº§u ká»³:`, colSpan: 7, styles: { fontStyle: 'bold', halign: 'right' } },
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
    doc.text('TỗNG Káº¾T CUá»I Ká»²:', 14, finalY);
    doc.setFont('Roboto-Regular', 'normal');
    doc.text(`Tá»•ng Nháº­p: ${formatNumber(ledgerData.totalImport)}`, 14, finalY + 6);
    doc.text(`Tá»•ng Xuáº¥t: ${formatNumber(ledgerData.totalExport)}`, 14, finalY + 12);
    doc.setFont('Roboto-Regular', 'bold');
    doc.text(`Tổn cuối ká»³: ${formatNumber(ledgerData.closingBalance)}`, 14, finalY + 18);

    const fileName = `SoKho_${productInfo.id}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
};