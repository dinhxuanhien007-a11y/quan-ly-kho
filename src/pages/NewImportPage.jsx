// src/pages/NewImportPage.jsx
import { formatNumber, parseFormattedNumber, calculateCaseCount } from '../utils/numberUtils'; // <-- THÊM calculateCaseCount
import ProductAutocomplete from '../components/ProductAutocomplete';
import SupplierAutocomplete from '../components/SupplierAutocomplete';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs, updateDoc, increment, writeBatch } from 'firebase/firestore';
import AddNewProductAndLotModal from '../components/AddNewProductAndLotModal';
import AddNewLotModal from '../components/AddNewLotModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { parseDateString, formatExpiryDate, formatDate } from '../utils/dateUtils';
import { FiInfo, FiXCircle, FiUpload } from 'react-icons/fi'; 
import { toast } from 'react-toastify';
import { z } from 'zod';
import useImportSlipStore from '../stores/importSlipStore';

// src/pages/NewExportPage.jsx (Thêm hàm này dưới các import)

/**
 * Xác định đơn vị cần hiển thị khi quy đổi.
 * @param {string} packagingStr - Chuỗi quy cách.
 * @param {string} currentUnit - ĐVT hiện tại của item.
 * @returns {string} - Đơn vị quy đổi (vd: Lọ, Thùng, Test).
 */
// src/pages/NewExportPage.jsx (Áp dụng tương tự cho NewImportPage.jsx)
// Thay thế hàm getTargetUnit

const getTargetUnit = (packagingStr, currentUnit) => {
    if (!packagingStr || !currentUnit) return 'Đơn vị';
    const lowerUnit = currentUnit.toLowerCase().trim();

    // --- QUY TẮC NHẮM MỤC TIÊU: LỌ/HỘP ---
    // Xử lý mã 246001 và các mã Hộp tương tự: Luôn ưu tiên Lọ hơn mL/G.
    if (lowerUnit === 'hộp') {
        // Cố gắng tìm đơn vị đếm (Lọ, Test, Cái)
        const countMatch = packagingStr.match(/(\d+(\.\d+)?)\s*(Test|Lọ|Cái|Ống|Bộ|Gói)\s*\//i);
        if (countMatch && countMatch[3]) {
            return countMatch[3].trim(); // Trả về Lọ (hoặc Test)
        }
    }
    // ----------------------------------------
    
    // --- LOGIC GỐC (Áp dụng cho các mã Thùng/Lít/Khay) ---
    if (lowerUnit === 'hộp' || lowerUnit === 'lọ' || lowerUnit === 'thùng' || lowerUnit === 'khay') { 
        
        // 1. Ưu tiên tìm đơn vị THỂ TÍCH/KHỐI LƯỢNG (Lít, mL, G)
        const volumeUnitMatch = packagingStr.match(/(\d+(\.\d+)?)\s*(Lít|mL|G|µg)\s*\//i);
        if (volumeUnitMatch && volumeUnitMatch[3]) {
             return volumeUnitMatch[3].trim(); 
        }

        // 2. Nếu không phải thể tích, ưu tiên tìm đơn vị ĐẾM (Lọ, Test, Cái)
        const countMatch = packagingStr.match(/(\d+(\.\d+)?)\s*(Test|Lọ|Cái|Ống|Bộ|Gói)\s*\//i);
        if (countMatch && countMatch[3]) {
            return countMatch[3].trim();
        }
        
        return 'Đơn vị'; 
    }

    // ... (Logic phép Chia giữ nguyên)
    const largeUnitMatch = packagingStr.match(/\/ (Hộp|Thùng|Can|Kiện|Lọ|Bộ|Gói|Khay)$/i);
    if (largeUnitMatch) {
        return largeUnitMatch[1].trim();
    }
    
    return 'Thùng'; 
}

// --- PHẦN SCHEMAS GIỮ NGUYÊN ---
const importItemSchema = z.object({
  id: z.number(),
  productId: z.string().min(1, "Mã hàng không được để trống."),
  productName: z.string(),
  unit: z.string(),
  packaging: z.string(),
  storageTemp: z.string(),
  team: z.string(),
  manufacturer: z.string(),
  notes: z.string(),
  lotNumber: z.string().nullable(),
  quantity: z.preprocess(
      val => Number(val),
      z.number({ invalid_type_error: "Số lượng phải là một con số." })
       .gt(0, { message: "Số lượng phải lớn hơn 0." })
  ),
  expiryDate: z.string().refine(val => {
      const trimmedVal = val.trim();
      return trimmedVal === '' || trimmedVal.toUpperCase() === 'N/A' || parseDateString(trimmedVal) !== null;
  }, {
      message: "Hạn sử dụng không hợp lệ (cần định dạng dd/mm/yyyy hoặc để trống)."
  }),
});

const importSlipSchema = z.object({
    supplierId: z.string().min(1, "Mã nhà cung cấp không được để trống."),
    supplierName: z.string().min(1, "Không tìm thấy tên nhà cung cấp."),
    items: z.array(importItemSchema).min(1, "Phiếu nhập phải có ít nhất một mặt hàng hợp lệ.")
});

// =============================================
// HÀM ĐỌC PACKING LIST PDF CỦA BECTON DICKINSON
// =============================================
const normalizePdfDate = (dateStr) => {
    const normalized = String(dateStr || '').trim().replace(/\./g, '/').replace(/-/g, '/');
    const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!match) return '';
    let [, d, m, y] = match;
    if (y.length === 2) y = `20${y}`;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
};

const parseBDStructuredItemsFromText = (rawText) => {
    const text = String(rawText || '');
    const fullText = text.replace(/\s+/g, ' ').trim();
    const lines = text
        .split('\n')
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    const rawItems = [];
    const pushIfValid = (productId, quantity, lotNumber, expiryDateRaw = '') => {
        const expiryDate = normalizePdfDate(expiryDateRaw);
        const qty = Number(String(quantity || '').replace(/[.,](?=\d{3}\b)/g, ''));
        const pid = String(productId || '').trim();
        const lot = String(lotNumber || '').trim();

        if (!pid || qty <= 0) return;

        // Cho phép dòng không có lot/HSD (vd mã hàng phụ kiện chỉ có EA).
        if (!lot) {
            rawItems.push({ productId: pid, quantity: qty, lotNumber: '', expiryDate: '' });
            return;
        }

        if (expiryDate) {
            rawItems.push({ productId: pid, quantity: qty, lotNumber: lot, expiryDate });
        }
    };

    // Ưu tiên parse theo từng dòng để tránh "ăn nhầm" qua dòng kế tiếp.
    // Case có lot + HSD: 246001 19 SP 5335368 24/11/2026
    const rowWithLot = /\b(\d{6,8})\b.*?\b(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(EA|SP|KT|BX)\s+([A-Z0-9.-]{4,})\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/i;
    // Case không lot/HSD: 651352 1 EA
    const rowNoLot = /\b(\d{6,8})\b.*?\b(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(EA|SP|KT|BX)\b/i;

    for (const line of lines) {
        const lotMatch = line.match(rowWithLot);
        if (lotMatch) {
            pushIfValid(lotMatch[1], lotMatch[2], lotMatch[4], lotMatch[5]);
            continue;
        }
        const noLotMatch = line.match(rowNoLot);
        if (noLotMatch) {
            pushIfValid(noLotMatch[1], noLotMatch[2], '', '');
        }
    }

    // Fallback cho text OCR nhiễu (mất xuống dòng/cột).
    // Chỉ chạy khi parse theo dòng không bắt được gì để tránh match trùng.
    if (rawItems.length === 0) {
        let match;
        // Pattern 1 fallback: mã -> số lượng -> đơn vị -> lot -> HSD
        const patternLegacy = /\b(\d{6,8})\b[\s\S]{0,120}?(\d{1,3}(?:[.,]\d{3})*|\d+)\s+(?:EA|SP|KT|BX)\s+([A-Z0-9.-]{4,})\s+(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/gi;
        while ((match = patternLegacy.exec(fullText)) !== null) {
            pushIfValid(match[1], match[2], match[3], match[4]);
        }

        // Pattern 2 fallback: mã -> lot -> HSD -> qty -> đơn vị
        const patternAltOrder = /\b(\d{6,8})\b[\s\S]{0,180}?([A-Z0-9.-]{4,})[\s\S]{0,100}?(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})[\s\S]{0,80}?(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(EA|SP|KT|BX)\b/gi;
        while ((match = patternAltOrder.exec(fullText)) !== null) {
            pushIfValid(match[1], match[4], match[2], match[3]);
        }
    }

    // Pattern 3: fallback nhẹ theo từng dòng OCR
    if (rawItems.length === 0) {
        const lines = String(rawText || '').split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
        for (const line of lines) {
            const productIdMatch = line.match(/\b(\d{6})\b/);
            const dateMatch = line.match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/);
            const qtyUnitMatch = line.match(/\b(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(EA|SP|KT|BX)\b/i);
            if (!productIdMatch || !dateMatch || !qtyUnitMatch) continue;

            const tokens = line.split(' ');
            const dateTokenIndex = tokens.findIndex(t => t.includes(dateMatch[1]));
            let lotCandidate = '';
            if (dateTokenIndex > 0) {
                const beforeDate = tokens[dateTokenIndex - 1];
                if (/^[A-Z0-9.-]{4,}$/i.test(beforeDate) && !/^\d+$/.test(beforeDate)) {
                    lotCandidate = beforeDate;
                }
            }
            if (!lotCandidate) {
                const lotFromLine = line.match(/\b([A-Z0-9.-]{5,})\b/gi)?.find(t => !/^\d+$/.test(t) && t !== productIdMatch[1]);
                lotCandidate = lotFromLine || '';
            }
            pushIfValid(productIdMatch[1], qtyUnitMatch[1], lotCandidate, dateMatch[1]);
        }
    }

    // Gộp theo mã + lot + HSD (dòng không lot sẽ có lotNumber/expiryDate rỗng)
    const aggregatedMap = new Map();
    for (const item of rawItems) {
        const key = `${item.productId}-${item.lotNumber}-${item.expiryDate}`;
        if (aggregatedMap.has(key)) {
            aggregatedMap.get(key).quantity += item.quantity;
        } else {
            aggregatedMap.set(key, { ...item });
        }
    }

    return Array.from(aggregatedMap.values()).sort((a, b) => {
        if (a.productId !== b.productId) return a.productId.localeCompare(b.productId);
        return a.lotNumber.localeCompare(b.lotNumber);
    });
};

const parseBDPackingList = async (file) => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    let extractedTextItems = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        extractedTextItems += textContent.items.length;
        if (!textContent.items.length) continue;

        // Reconstruct text line-by-line by y-coordinate to avoid cross-row matching.
        const rows = new Map();
        for (const item of textContent.items) {
            const str = String(item.str || '').trim();
            if (!str) continue;
            const x = item.transform?.[4] ?? 0;
            const y = item.transform?.[5] ?? 0;
            const yKey = Math.round(y);

            let foundKey = null;
            for (const key of rows.keys()) {
                if (Math.abs(key - yKey) <= 2) {
                    foundKey = key;
                    break;
                }
            }
            if (foundKey === null) {
                rows.set(yKey, []);
                foundKey = yKey;
            }
            rows.get(foundKey).push({ x, str });
        }

        const sortedRowKeys = Array.from(rows.keys()).sort((a, b) => b - a);
        const pageLines = sortedRowKeys.map((key) => {
            const words = rows.get(key).sort((a, b) => a.x - b.x).map(w => w.str);
            return words.join(' ').replace(/\s+/g, ' ').trim();
        }).filter(Boolean);

        fullText += `${pageLines.join('\n')}\n`;
    }

    let parsedItems = parseBDStructuredItemsFromText(fullText);
    if (parsedItems.length > 0) return parsedItems;

    // OCR fallback cho PDF scan/image-only
    if (extractedTextItems === 0) {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        try {
            let ocrText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                await page.render({ canvasContext: context, viewport }).promise;
                const { data } = await worker.recognize(canvas);
                ocrText += `${data?.text || ''}\n`;
            }
            parsedItems = parseBDStructuredItemsFromText(ocrText);
        } finally {
            await worker.terminate();
        }
    }

    return parsedItems;
};

// =============================================
// HÀM ĐỌC PACKING LIST PDF CỦA ICU MEDICAL
// =============================================
const parseICUPackingList = async (file) => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + ' ';
    }

    // Map tên tháng tiếng Anh → số
    const monthMap = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };

    // Hàm chuyển "30-JUN-2028" → "30/06/2028"
    const convertICUDate = (dateStr) => {
        const match = dateStr.match(/(\d{2})-([A-Z]{3})-(\d{4})/);
        if (!match) return null;
        const [, day, mon, year] = match;
        const month = monthMap[mon];
        if (!month) return null;
        return `${day}/${month}/${year}`;
    };

    // Regex trích xuất từng dòng hàng ICU
    // Format mỗi dòng: [N)] [ITEM CODE] [LOT]/ [DD-MON-YYYY] ... [Qty Per UOM] ...
    // Ví dụ: "1) 4619PG 6142088/ 30-JUN-2028 PRO-VENT... 200 2800 14 38.10"
    // Format mỗi dòng ICU:
// [N)] [ITEM CODE] [LOT]/ [DD-MON-YYYY] [description...] [Qty Per UOM] [Qty EA] [Qty Case] [Net Weight]
// Ví dụ: "1) 4041E 6132032/ 30-APR-2028 LINE DRAW... 200 8000 40"
// Ta cần: Qty EA = số thứ 2 sau HSD (8000), không phải số thứ 1 (200)
const lineRegex = /(\d+)\)\s+([A-Z0-9]+)\s+(\d+)\s*\/\s*(\d{2}-[A-Z]{3}-\d{4})/g;

const rawItems = [];
let match;

while ((match = lineRegex.exec(fullText)) !== null) {
    const productId = match[2].trim();
    const lotNumber = match[3].trim();
    const expiryRaw = match[4].trim();

    if (!productId || /^\d+$/.test(productId)) continue;

    const expiryDate = convertICUDate(expiryRaw);
    if (!expiryDate) continue;

    // Lấy phần text SAU vị trí match để tìm số lượng
    const afterMatch = fullText.slice(match.index + match[0].length, match.index + match[0].length + 300);

    // Tìm pattern: [200] [QtyEA] [QtyCase]
    // Qty Per UOM luôn là 200, theo sau là Qty EA rồi Qty Case
    // Dùng regex tìm "200 [số] [số]" — bỏ qua Order No và Packing No
    // Order No dạng 7 chữ số (9229330), Packing No dạng M+số
    // Ta chỉ lấy các số KHÔNG có chữ đứng trước và có độ dài hợp lý
    const qtyPattern = /\b(200)\s+(\d{1,6})\s+(\d{1,3})\b/;
    const qtyMatch = afterMatch.match(qtyPattern);

    if (!qtyMatch) continue;

    const qtyEA = parseInt(qtyMatch[2], 10);
    if (isNaN(qtyEA) || qtyEA <= 0) continue;

    rawItems.push({ productId, lotNumber, expiryDate, quantity: qtyEA });
}

    // Gộp các dòng cùng mã hàng + cùng lot + cùng HSD → cộng dồn số lượng
    const aggregatedMap = new Map();
    for (const item of rawItems) {
        const key = `${item.productId}-${item.lotNumber}-${item.expiryDate}`;
        if (aggregatedMap.has(key)) {
            aggregatedMap.get(key).quantity += item.quantity;
        } else {
            aggregatedMap.set(key, { ...item });
        }
    }

    // Sắp xếp: cùng mã hàng nằm cạnh nhau, trong cùng mã thì sort theo lot
    const sortedItems = Array.from(aggregatedMap.values()).sort((a, b) => {
        if (a.productId !== b.productId) {
            return a.productId.localeCompare(b.productId);
        }
        return a.lotNumber.localeCompare(b.lotNumber);
    });

    return sortedItems;
};

// =============================================
// HÀM ĐỌC PACKING LIST PDF CỦA SCHULKE
// =============================================
const parseSchulkePackingList = async (file) => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const allRows = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();

        const pageWords = textContent.items
            .filter(item => item.str.trim())
            .map(item => ({
                text: item.str.trim(),
                x0: item.transform[4],
                x1: item.transform[4] + item.width,
                y: viewport.height - item.transform[5]
            }));

        const rowMap = new Map();
        for (const w of pageWords) {
            const yKey = Math.round(w.y);
            let foundKey = null;
            for (const ky of rowMap.keys()) {
                if (Math.abs(ky - yKey) <= 3) { foundKey = ky; break; }
            }
            if (foundKey === null) { rowMap.set(yKey, []); foundKey = yKey; }
            rowMap.get(foundKey).push(w);
        }
        for (const [y, words] of [...rowMap.entries()].sort((a, b) => a[0] - b[0])) {
            allRows.push({ y, words: words.sort((a, b) => a.x0 - b.x0) });
        }
    }

    // Tìm header row
    const headerIdx = allRows.findIndex(r =>
        r.words.some(w => w.text === 'Article') &&
        r.words.some(w => w.text === 'Batch')
    );
    if (headerIdx === -1) return [];

    // Tìm tọa độ các cột từ header rows (header có thể trải 2-3 dòng)
    let batchHeader = null, expiryHeader = null, bottlesHeader = null, palletsHeader = null;
    for (let i = headerIdx; i < Math.min(headerIdx + 4, allRows.length); i++) {
        const row = allRows[i];
        if (!batchHeader) batchHeader = row.words.find(w => w.text === 'Batch');
        if (!expiryHeader) expiryHeader = row.words.find(w => w.text === 'Expiry');
        if (!bottlesHeader) bottlesHeader = row.words.find(w => w.text === 'Bottles');
        if (!palletsHeader) palletsHeader = row.words.find(w => w.text === 'Pallets');
    }

    if (!bottlesHeader) return [];

    // Dùng x0 của Bottles header để phân biệt với cột Pallets
    // Bottles x0 > Pallets x0 → chỉ lấy số có x0 >= Bottles x0 - 5
    const BOTTLES_X_MIN = bottlesHeader.x0 - 5;
    const BOTTLES_X_MAX = bottlesHeader.x1 + 10;
    const BATCH_X = batchHeader ? batchHeader.x0 : 276;
    const EXPIRY_X = expiryHeader ? expiryHeader.x0 : 310;

    // Tìm Total row
    const totalIdx = allRows.findIndex((r, i) =>
        i > headerIdx && r.words.some(w => w.text === 'Total')
    );
    const endIdx = totalIdx === -1 ? allRows.length : totalIdx;
    const dataRows = allRows.slice(headerIdx + 1, endIdx)
        .filter(r => r.y > allRows[headerIdx].y + 10);

    const normalizeDate = (raw) => {
        const s = raw.replace(/\./g, '/');
        const parts = s.split('/');
        if (parts.length === 3) {
            const [d, mo, y] = parts;
            return `${d.padStart(2,'0')}/${mo.padStart(2,'0')}/${y}`;
        }
        return raw;
    };

    const itemMap = new Map();

    for (const row of dataRows) {
        // Article: số 5-8 chữ số ở cột đầu
        const articleWord = row.words.find(w =>
            w.x0 >= 50 && w.x0 <= 85 && /^\d{5,8}$/.test(w.text)
        );
        if (!articleWord) continue;

        // No. of Bottles: số nguyên trong vùng x của cột Bottles
        // Dùng range chính xác để không nhầm với cột Pallets
        const bottlesWord = row.words.find(w =>
            w.x0 >= BOTTLES_X_MIN && w.x0 <= BOTTLES_X_MAX && /^\d+$/.test(w.text)
        );
        if (!bottlesWord) continue;

        // Batch: số 6+ chữ số gần cột Batch
        // Nếu là "-" thì lotNumber = rỗng (hàng không có lot)
        const batchWord = row.words.find(w =>
            Math.abs(w.x0 - BATCH_X) <= 20
        );
        const lotNumber = (batchWord && /^\d{6,}$/.test(batchWord.text))
            ? batchWord.text
            : '';

        // Expiry: ngày gần cột Expiry (có thể không có nếu batch="-")
        const expiryWord = row.words.find(w =>
            Math.abs(w.x0 - EXPIRY_X) <= 20 &&
            /\d{1,2}[\/\.]\d{1,2}[\/\.](\d{2}|\d{4})/.test(w.text)
        );
        const expiryDate = expiryWord ? normalizeDate(expiryWord.text) : '';

        const productId = articleWord.text;
        const quantity = parseInt(bottlesWord.text, 10);
        if (quantity <= 0) continue;

        // Cộng dồn nếu cùng mã hàng + cùng lot
        const key = `${productId}-${lotNumber}`;
        if (itemMap.has(key)) {
            itemMap.get(key).quantity += quantity;
        } else {
            itemMap.set(key, { productId, lotNumber, quantity, expiryDate });
        }
    }

    return [...itemMap.values()].sort((a, b) => {
        if (a.productId !== b.productId) return a.productId.localeCompare(b.productId);
        return a.lotNumber.localeCompare(b.lotNumber);
    });
};

const isDynamicChunkLoadError = (error) => {
    const message = String(error?.message || error || '');
    return message.includes('Failed to fetch dynamically imported module')
        || message.includes('Failed to fetch');
};

const NewImportPage = () => {
    const {
        supplierId, supplierName, description, items, importDate,
        setSupplier, setDescription, setImportDate, addNewItemRow, updateItem,
        handleProductSearchResult, handleLotCheckResult, declareNewLot,
        fillNewProductData, resetSlip, removeItemRow
    } = useImportSlipStore();

    const [isSaving, setIsSaving] = useState(false);
    const [newProductModal, setNewProductModal] = useState({ isOpen: false, productId: '', index: -1 });
    const [newLotModal, setNewLotModal] = useState({ isOpen: false, index: -1 });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [focusedInputIndex, setFocusedInputIndex] = useState(null);
    const [isParsingPDF, setIsParsingPDF] = useState(false);
    const pdfInputRef = useRef(null);
    const icuPdfInputRef = useRef(null);
    const pharmaPdfInputRef = useRef(null);
    const schulkePdfInputRef = useRef(null);

    const productInputRefs = useRef([]);
    const lotNumberInputRefs = useRef([]);
    const quantityInputRefs = useRef([]);
    const addRowButtonRef = useRef(null);
    const prevItemsLength = useRef(items.length);

    useEffect(() => {
        if (items.length > prevItemsLength.current) {
            const lastIndex = items.length - 1;
            if (productInputRefs.current[lastIndex]) {
                productInputRefs.current[lastIndex].focus();
            }
        }
        prevItemsLength.current = items.length;
    }, [items.length]);

    // Reset importDate về hôm nay mỗi khi vào trang (tránh lưu ngày cũ từ localStorage)
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setImportDate(today);
    }, []);

    
    const isSlipValid = useMemo(() => {
        const hasSupplier = supplierId.trim() !== '' && supplierName.trim() !== '';
        const hasValidItem = items.some(
            item => item.productId && Number(item.quantity) > 0
        );
        return hasSupplier && hasValidItem;
    }, [supplierId, supplierName, items]);

    const disabledReason = useMemo(() => {
        if (isSlipValid) return '';
        if (!supplierId.trim() || !supplierName.trim()) {
            return 'Vui lòng chọn Nhà Cung Cấp.';
        }
        if (!items.some(item => item.productId && Number(item.quantity) > 0)) {
            return 'Vui lòng thêm ít nhất một sản phẩm với số lượng hợp lệ.';
        }
        return 'Vui lòng điền đầy đủ thông tin bắt buộc (*).';
    }, [isSlipValid, supplierId, supplierName, items]);

    const handleRemoveRow = (index) => {
        if (items.length <= 1) return;
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xóa dòng?",
            message: "Bạn có chắc chắn muốn xóa dòng hàng này khỏi phiếu nhập không?",
            onConfirm: () => {
                removeItemRow(index);
                setConfirmModal({ isOpen: false });
            }
        });
    };

    const getValidSlipData = () => {
        const validItems = items.filter(item => 
            item.productId && item.quantity
        ).map(item => ({
            ...item,
            lotNumber: item.lotNumber.trim() || null
        }));

        if (validItems.length === 0) {
            toast.warn("Phiếu nhập phải có ít nhất một mặt hàng hợp lệ.");
            return null;
        }

        const slipToValidate = {
            supplierId: supplierId.trim(),
            supplierName: supplierName.trim(),
            items: validItems
        };

        const validationResult = importSlipSchema.safeParse(slipToValidate);

        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
            return null;
        }

        return {
            ...validationResult.data,
            importDate: importDate ? importDate.split('-').reverse().join('/') : formatDate(new Date()),
            description,
            productIds: Array.from(new Set(validationResult.data.items.map(item => item.productId))),
            status: '',
            createdAt: serverTimestamp()
        };
    }
    
    const handleSupplierSearch = async (idToSearch = supplierId) => {
        if (!idToSearch) {
            setSupplier(idToSearch, '');
            return;
        }
        try {
            const partnerRef = doc(db, 'partners', idToSearch.toUpperCase());
            const partnerSnap = await getDoc(partnerRef);
            
            if (partnerSnap.exists() && partnerSnap.data().partnerType === 'supplier') {
                setSupplier(idToSearch, partnerSnap.data().partnerName);
            } else {
                setSupplier(idToSearch, '');
                toast.error(`Không tìm thấy Nhà cung cấp với mã "${idToSearch}"`);
            }
        } catch (error) {
            console.error("Lỗi khi tìm nhà cung cấp:", error);
            toast.error("Không thể đọc dữ liệu NCC. Kiểm tra Console (F12)!"); 
            setSupplier(idToSearch, '');
        }
    };
    
    const handleExpiryDateBlur = (index, value) => {
        const formattedValue = formatExpiryDate(value);
        updateItem(index, 'expiryDate', formattedValue);

        if (!formattedValue || formattedValue.toUpperCase() === 'N/A') {
            return;
        }

        const expiryDateObject = parseDateString(formattedValue);

        if (expiryDateObject) {
            const today = new Date();
            today.setHours(0, 0, 0, 0); 
            if (expiryDateObject < today) {
                toast.warn(`Cảnh báo: Hạn sử dụng "${formattedValue}" của mặt hàng ở dòng ${index + 1} đã ở trong quá khứ.`);
            }
        }
    };

    // --- BẮT ĐẦU THAY ĐỔI: Cập nhật hàm checkExistingLot ---
    const checkExistingLot = async (index) => {
            const currentItem = items[index];
            if (!currentItem.productId || !currentItem.lotNumber) return;

            // Nếu chưa có thông tin sản phẩm, load trước
            if (!currentItem.productName) {
                await handleProductSearch(index, currentItem.productId);
                // Đọc state mới nhất từ store sau khi update (tránh closure cũ)
                const freshItem = useImportSlipStore.getState().items[index];
                if (!freshItem || freshItem.productNotFound) return;
            }

            try {
                const q = query(
                    collection(db, "inventory_lots"),
                    where("productId", "==", currentItem.productId.trim()),
                    where("lotNumber", "==", currentItem.lotNumber.trim())
                );
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const baseLotData = querySnapshot.docs[0].data();

                    let totalQuantityRemaining = 0;
                    querySnapshot.forEach(doc => {
                        totalQuantityRemaining += doc.data().quantityRemaining;
                    });

                    const aggregatedLotData = {
                        ...baseLotData,
                        quantityRemaining: totalQuantityRemaining
                    };

                    handleLotCheckResult(index, aggregatedLotData, true);
                    setTimeout(() => quantityInputRefs.current[index]?.focus(), 0);
                } else {
                    handleLotCheckResult(index, null, false);
                    setNewLotModal({ isOpen: true, index: index });
                }
            } catch (error) {
                console.error("Lỗi khi kiểm tra lô tồn tại: ", error);
            }
        };
    // --- KẾT THÚC THAY ĐỔI ---

    const handleProductSearch = async (index, productOrId) => {
        if (!productOrId) return;

        let productData = null;
        if (typeof productOrId === 'object' && productOrId !== null) {
            productData = productOrId;
        } else {
            const productId = String(productOrId).trim().toUpperCase();
            if (!productId) return;
            try {
                const productRef = doc(db, 'products', productId);
                const productSnap = await getDoc(productRef);
                if (productSnap.exists()) {
                    productData = { id: productSnap.id, ...productSnap.data() };
                }
            } catch (error) {
                console.error("Lỗi khi tìm kiếm sản phẩm:", error);
                toast.error("Lỗi khi tìm kiếm sản phẩm!");
            }
        }

        handleProductSearchResult(index, productData, !!productData);
        if (productData) {
            updateItem(index, 'productId', productData.id);
            setTimeout(() => lotNumberInputRefs.current[index]?.focus(), 0);
        }
    };

    const handleNewLotDeclared = (expiry) => {
        const { index } = newLotModal;
        declareNewLot(index, expiry);
        setNewLotModal({ isOpen: false, index: -1 });
        setTimeout(() => quantityInputRefs.current[index]?.focus(), 0);
    };

    const handleLotNumberKeyDown = (e, index) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.target.blur(); 
        }
    };

    const handleQuantityKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addRowButtonRef.current?.focus();
        }
    };

    const handleNewProductCreated = (newData) => {
        const { index } = newProductModal;
        fillNewProductData(index, newData);
        setNewProductModal({ isOpen: false, productId: '', index: -1 });
    };

    const handlePDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        toast.warn("Vui lòng chọn file PDF hợp lệ.");
        return;
    }

    setIsParsingPDF(true);
    toast.info("Đang đọc Packing List...");

    try {
        const parsedItems = await parseBDPackingList(file);

        if (parsedItems.length === 0) {
            toast.error("Không tìm thấy dữ liệu hàng hóa trong file PDF này.");
            return;
        }

        // Tra cứu từng mã hàng trong Firestore
        const uniqueProductIds = [...new Set(parsedItems.map(i => i.productId))];
        const productSnapshots = await Promise.all(
            uniqueProductIds.map(id => getDoc(doc(db, 'products', id)))
        );

        const productMap = {};
        productSnapshots.forEach(snap => {
            if (snap.exists()) {
                productMap[snap.id] = snap.data();
            }
        });

        // Tạo danh sách items đầy đủ trước
        const newItems = [];
        const notFoundIds = new Set();

        for (const parsed of parsedItems) {
    const productData = productMap[parsed.productId];

    // Kiểm tra lot đã tồn tại trong Firestore chưa
    let lotStatus = 'declared';
    let existingLotInfo = null;

    if (productData) {
        const lotQuery = query(
            collection(db, 'inventory_lots'),
            where('productId', '==', parsed.productId),
            where('lotNumber', '==', parsed.lotNumber)
        );
        const lotSnapshot = await getDocs(lotQuery);

        if (!lotSnapshot.empty) {
            // Lô đã tồn tại — cộng dồn tồn kho từ tất cả các doc
            let totalRemaining = 0;
            let expiryDate = null;
            lotSnapshot.forEach(d => {
                totalRemaining += d.data().quantityRemaining || 0;
                if (!expiryDate && d.data().expiryDate) {
                    expiryDate = d.data().expiryDate;
                }
            });
            lotStatus = 'exists';
            existingLotInfo = {
                quantityRemaining: totalRemaining,
                expiryDate: expiryDate ? formatDate(expiryDate.toDate()) : parsed.expiryDate
            };
        }
    }

    if (productData) {
        newItems.push({
            id: Date.now() + Math.random(),
            productId: parsed.productId,
            productName: productData.productName || '',
            unit: productData.unit || '',
            packaging: productData.packaging || '',
            storageTemp: productData.storageTemp || '',
            team: productData.team || '',
            manufacturer: productData.manufacturer || '',
            subGroup: productData.subGroup || '',
            conversionFactor: productData.conversionFactor || 1,
            lotNumber: parsed.lotNumber,
            expiryDate: parsed.expiryDate,
            quantity: parsed.quantity,
            notes: '',
            productNotFound: false,
            lotStatus: lotStatus,           // ✅ đúng trạng thái
            existingLotInfo: existingLotInfo // ✅ có thông tin nếu lô cũ
        });
    } else {
        notFoundIds.add(parsed.productId);
        newItems.push({
            id: Date.now() + Math.random(),
            productId: parsed.productId,
            productName: '',
            unit: '',
            packaging: '',
            storageTemp: '',
            team: '',
            manufacturer: '',
            subGroup: '',
            conversionFactor: 1,
            lotNumber: parsed.lotNumber,
            expiryDate: parsed.expiryDate,
            quantity: parsed.quantity,
            notes: '',
            productNotFound: true,
            lotStatus: 'declared',
            existingLotInfo: null
        });
    }
}

        // ✅ CÁCH MỚI: Dùng store action để set toàn bộ items 1 lần
        // thay vì addNewItemRow + updateItem từng dòng gây ra dòng trống
        useImportSlipStore.setState(state => ({
            ...state,
            items: newItems
        }));

        // Thông báo kết quả
        if (notFoundIds.size > 0) {
            toast.warn(
                `⚠️ Đọc PDF thành công! Có ${notFoundIds.size} mã hàng chưa tồn tại: ${[...notFoundIds].join(', ')}. Vui lòng kiểm tra các dòng được đánh dấu vàng.`,
                { autoClose: 8000 }
            );
        } else {
            toast.success(
                `✅ Đọc PDF thành công! Đã nhập ${parsedItems.length} dòng hàng. Vui lòng điều chỉnh số lượng theo đơn vị quy đổi.`
            );
        }

    } catch (error) {
        console.error("Lỗi khi đọc PDF:", error);
        if (isDynamicChunkLoadError(error)) {
            toast.error("Ứng dụng vừa được cập nhật. Vui lòng tải lại trang (Ctrl+F5) rồi thử import PDF lại.");
        } else {
            toast.error("Không thể đọc file PDF. Vui lòng thử lại.");
        }
    } finally {
        setIsParsingPDF(false);
        if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
};

const handleICUPDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        toast.warn("Vui lòng chọn file PDF hợp lệ.");
        return;
    }

    setIsParsingPDF(true);
    toast.info("Đang đọc Packing List ICU Medical...");

    try {
        const parsedItems = await parseICUPackingList(file);

        if (parsedItems.length === 0) {
            toast.error("Không tìm thấy dữ liệu hàng hóa trong file PDF này.");
            return;
        }

        // Tra cứu từng mã hàng trong Firestore
        const uniqueProductIds = [...new Set(parsedItems.map(i => i.productId))];
        const productSnapshots = await Promise.all(
            uniqueProductIds.map(id => getDoc(doc(db, 'products', id)))
        );

        const productMap = {};
        productSnapshots.forEach(snap => {
            if (snap.exists()) productMap[snap.id] = snap.data();
        });

        const newItems = [];
        const notFoundIds = new Set();

        for (const parsed of parsedItems) {
            const productData = productMap[parsed.productId];

            // Kiểm tra lot đã tồn tại chưa
            let lotStatus = 'declared';
            let existingLotInfo = null;

            if (productData) {
                const lotQuery = query(
                    collection(db, 'inventory_lots'),
                    where('productId', '==', parsed.productId),
                    where('lotNumber', '==', parsed.lotNumber)
                );
                const lotSnapshot = await getDocs(lotQuery);

                if (!lotSnapshot.empty) {
                    let totalRemaining = 0;
                    let expiryDate = null;
                    lotSnapshot.forEach(d => {
                        totalRemaining += d.data().quantityRemaining || 0;
                        if (!expiryDate && d.data().expiryDate) {
                            expiryDate = d.data().expiryDate;
                        }
                    });
                    lotStatus = 'exists';
                    existingLotInfo = {
                        quantityRemaining: totalRemaining,
                        expiryDate: expiryDate ? formatDate(expiryDate.toDate()) : parsed.expiryDate
                    };
                }
            }

            if (productData) {
                newItems.push({
                    id: Date.now() + Math.random(),
                    productId: parsed.productId,
                    productName: productData.productName || '',
                    unit: productData.unit || '',
                    packaging: productData.packaging || '',
                    storageTemp: productData.storageTemp || '',
                    team: productData.team || '',
                    manufacturer: productData.manufacturer || '',
                    subGroup: productData.subGroup || '',
                    conversionFactor: productData.conversionFactor || 1,
                    lotNumber: parsed.lotNumber,
                    expiryDate: parsed.expiryDate,
                    quantity: parsed.quantity,
                    notes: '',
                    productNotFound: false,
                    lotStatus,
                    existingLotInfo
                });
            } else {
                notFoundIds.add(parsed.productId);
                newItems.push({
                    id: Date.now() + Math.random(),
                    productId: parsed.productId,
                    productName: '',
                    unit: '',
                    packaging: '',
                    storageTemp: '',
                    team: '',
                    manufacturer: '',
                    subGroup: '',
                    conversionFactor: 1,
                    lotNumber: parsed.lotNumber,
                    expiryDate: parsed.expiryDate,
                    quantity: parsed.quantity,
                    notes: '',
                    productNotFound: true,
                    lotStatus: 'declared',
                    existingLotInfo: null
                });
            }
        }

        // Set toàn bộ items 1 lần
        useImportSlipStore.setState(state => ({
            ...state,
            items: newItems
        }));

        if (notFoundIds.size > 0) {
            toast.warn(
                `⚠️ Đọc PDF thành công! Có ${notFoundIds.size} mã hàng chưa tồn tại: ${[...notFoundIds].join(', ')}. Vui lòng kiểm tra các dòng màu vàng.`,
                { autoClose: 8000 }
            );
        } else {
            toast.success(
                `✅ Đọc PDF ICU Medical thành công! Đã nhập ${parsedItems.length} dòng hàng. Vui lòng điều chỉnh số lượng theo đơn vị quy đổi.`
            );
        }

    } catch (error) {
        console.error("Lỗi khi đọc PDF ICU:", error);
        if (isDynamicChunkLoadError(error)) {
            toast.error("Ứng dụng vừa được cập nhật. Vui lòng tải lại trang (Ctrl+F5) rồi thử import PDF lại.");
        } else {
            toast.error("Không thể đọc file PDF. Vui lòng thử lại.");
        }
    } finally {
        setIsParsingPDF(false);
        if (icuPdfInputRef.current) icuPdfInputRef.current.value = '';
    }
};

// =============================================
// HÀM ĐỌC PACKING LIST PDF CỦA PHARMADESIGN
// =============================================
const parsePharmadesignPackingList = async (file) => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    const allRows = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();

        // Thu thập words với tọa độ
        const pageWords = textContent.items
            .filter(item => item.str.trim())
            .map(item => ({
                text: item.str.trim(),
                x0: item.transform[4],
                x1: item.transform[4] + item.width,
                y: viewport.height - item.transform[5]
            }));

        fullText += textContent.items.map(i => i.str).join(' ') + ' ';

        // Nhóm theo dòng (y gần nhau ≤ 3px)
        const rowMap = new Map();
        for (const w of pageWords) {
            const yKey = Math.round(w.y);
            let foundKey = null;
            for (const ky of rowMap.keys()) {
                if (Math.abs(ky - yKey) <= 3) { foundKey = ky; break; }
            }
            if (foundKey === null) { rowMap.set(yKey, []); foundKey = yKey; }
            rowMap.get(foundKey).push(w);
        }

        for (const [y, words] of [...rowMap.entries()].sort((a, b) => a[0] - b[0])) {
            allRows.push({ y, words: words.sort((a, b) => a.x0 - b.x0) });
        }
    }

    // === BƯỚC 1: Parse Lot Info từ Remark ===
    const lotExpMap = {};

    // Format A: "Lot no. B2472.3 MFG 13- 01 -26 EXP 13- 01 -29"
    const regA = /Lot\s+[Nn]o\.?\s*:?\s*(B[\w.]+)\s+MFG[\s\S]*?EXP\s+(\d{1,2})[\s\-]+(\d{1,2})[\s\-]+(\d{2,4})/g;
    let m;
    while ((m = regA.exec(fullText)) !== null) {
        const lot = m[1].trim();
        let [d, mo, y] = [m[2], m[3], m[4]];
        if (y.length === 2) y = '20' + y;
        lotExpMap[lot] = `${d.padStart(2,'0')}/${mo.padStart(2,'0')}/${y}`;
    }
    // Format B: "Lot No. : B2382.2 MFG. : 03/11/25 EXP. : 03/11/28"
    const regB = /Lot\s+[Nn]o\.?\s*:?\s*(B[\w.]+)\s+MFG[.\s]+:?\s*[\d/\-\s]+EXP[.\s]+:?\s*(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})/g;
    while ((m = regB.exec(fullText)) !== null) {
        const lot = m[1].trim();
        let [d, mo, y] = [m[2], m[3], m[4]];
        if (y.length === 2) y = '20' + y;
        lotExpMap[lot] = `${d.padStart(2,'0')}/${mo.padStart(2,'0')}/${y}`;
    }
    if (Object.keys(lotExpMap).length === 0) return [];

    // === BƯỚC 2: Tìm header và vùng bảng ===
    const headerIdx = allRows.findIndex(r =>
        r.words.some(w => w.text === 'ITEM') &&
        r.words.some(w => w.text === 'DESCRIPTION')
    );
    const totalIdx = allRows.findIndex((r, i) =>
        i > headerIdx &&
        r.words.some(w => w.text === 'TOTAL') &&
        r.words.some(w => /^\d/.test(w.text))
    );
    if (headerIdx === -1) return [];
    const tableRows = allRows.slice(headerIdx + 1, totalIdx === -1 ? allRows.length : totalIdx);

    // X tối thiểu của batch trong bảng (để loại batch trong phần Remark)
    const batchHeader = allRows[headerIdx].words.find(w => w.text === 'BATCH');
    const BATCH_X_MIN = batchHeader ? batchHeader.x0 - 20 : 250;

    // === BƯỚC 3: Hàm lấy nhóm số đầu tiên sau batch ===
    // Nhóm số = các số liên tiếp có khoảng cách x < 25px
    const parseFirstNumberGroup = (numbersAfter) => {
        if (!numbersAfter.length) return 0;
        const group = [numbersAfter[0]];
        for (let i = 1; i < numbersAfter.length; i++) {
            const gap = numbersAfter[i].x0 - numbersAfter[i-1].x1;
            if (gap > 25) break; // Sang cột khác → dừng
            group.push(numbersAfter[i]);
        }
        const s = group.map(w => w.text).join('').replace(/,/g, '').replace(/\s/g, '');
        const n = parseInt(s, 10);
        return isNaN(n) ? 0 : n;
    };

    // === BƯỚC 4: Tìm anchors DL ===
    const anchors = [];
    for (const row of tableRows) {
        const dlWord = row.words.find(w => w.x0 >= 40 && w.x0 <= 90 && /^DL\d+$/.test(w.text));
        if (dlWord) anchors.push({ y: row.y, dl: dlWord.text });
    }

    // === BƯỚC 5: Chia blocks theo midpoint giữa 2 DL liên tiếp ===
    const dlBlocks = anchors.map((anchor, i) => ({
        dl: anchor.dl,
        yStart: i > 0 ? Math.floor((anchors[i-1].y + anchor.y) / 2) : 0,
        yEnd: i + 1 < anchors.length ? Math.floor((anchor.y + anchors[i+1].y) / 2) : 99999
    }));

    // === BƯỚC 6: Xử lý từng block ===
    const itemResults = new Map(); // batch → {dl, qty}

    for (const block of dlBlocks) {
        const blockRows = tableRows.filter(r => r.y >= block.yStart && r.y < block.yEnd);
        let currentBatch = null;
        let pendingQty = 0; // Qty xuất hiện trước batch

        for (const row of blockRows) {
            // Lấy batch trong vùng bảng
            const batchWord = row.words.find(w =>
                w.x0 >= BATCH_X_MIN && /^B\d{4}/.test(w.text)
            );

            // Lấy các số sau batch (hoặc sau BATCH_X_MIN)
            const xStart = batchWord ? batchWord.x1 : BATCH_X_MIN + 40;
            const numbersAfter = row.words.filter(w =>
                w.x0 >= xStart && /^[\d,]+$/.test(w.text)
            );

            if (batchWord) {
                currentBatch = batchWord.text;
                if (!itemResults.has(currentBatch)) {
                    itemResults.set(currentBatch, { dl: block.dl, qty: 0 });
                }
                // Gán pending qty
                itemResults.get(currentBatch).qty += pendingQty;
                pendingQty = 0;
                // Qty dòng này
                if (numbersAfter.length > 0) {
                    itemResults.get(currentBatch).qty += parseFirstNumberGroup(numbersAfter);
                }
            } else if (numbersAfter.length > 0) {
                const qty = parseFirstNumberGroup(numbersAfter);
                if (qty > 0) {
                    if (currentBatch) {
                        itemResults.get(currentBatch).qty += qty;
                    } else {
                        pendingQty += qty;
                    }
                }
            }
        }
    }

    // === BƯỚC 7: Tạo kết quả và sắp xếp ===
    return [...itemResults.entries()]
        .filter(([, data]) => data.qty > 0)
        .map(([batch, data]) => ({
            productId: data.dl,
            lotNumber: batch,
            quantity: data.qty,
            expiryDate: lotExpMap[batch] || ''
        }))
        .sort((a, b) => {
            if (a.productId !== b.productId) return a.productId.localeCompare(b.productId);
            return a.lotNumber.localeCompare(b.lotNumber);
        });
};

const handlePharmaPDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        toast.warn("Vui lòng chọn file PDF hợp lệ.");
        return;
    }

    setIsParsingPDF(true);
    toast.info("Đang đọc Packing List Pharmadesign...");

    try {
        const parsedItems = await parsePharmadesignPackingList(file);

        if (parsedItems.length === 0) {
            toast.error("Không tìm thấy dữ liệu hàng hóa. File có thể không đúng format Pharmadesign hoặc thiếu thông tin Lot/HSD trong phần Remark.");
            return;
        }

        // Tra cứu mã hàng trong Firestore
        const uniqueProductIds = [...new Set(parsedItems.map(i => i.productId))];
        const productSnapshots = await Promise.all(
            uniqueProductIds.map(id => getDoc(doc(db, 'products', id)))
        );

        const productMap = {};
        productSnapshots.forEach(snap => {
            if (snap.exists()) productMap[snap.id] = snap.data();
        });

        const newItems = [];
        const notFoundIds = new Set();

        for (const parsed of parsedItems) {
            const productData = productMap[parsed.productId];

            // Kiểm tra lot đã tồn tại chưa
            let lotStatus = 'declared';
            let existingLotInfo = null;

            if (productData) {
                const lotQuery = query(
                    collection(db, 'inventory_lots'),
                    where('productId', '==', parsed.productId),
                    where('lotNumber', '==', parsed.lotNumber)
                );
                const lotSnapshot = await getDocs(lotQuery);

                if (!lotSnapshot.empty) {
                    let totalRemaining = 0;
                    let expiryDate = null;
                    lotSnapshot.forEach(d => {
                        totalRemaining += d.data().quantityRemaining || 0;
                        if (!expiryDate && d.data().expiryDate) {
                            expiryDate = d.data().expiryDate;
                        }
                    });
                    lotStatus = 'exists';
                    existingLotInfo = {
                        quantityRemaining: totalRemaining,
                        expiryDate: expiryDate ? formatDate(expiryDate.toDate()) : parsed.expiryDate
                    };
                }
            }

            if (productData) {
                newItems.push({
                    id: Date.now() + Math.random(),
                    productId: parsed.productId,
                    productName: productData.productName || '',
                    unit: productData.unit || '',
                    packaging: productData.packaging || '',
                    storageTemp: productData.storageTemp || '',
                    team: productData.team || '',
                    manufacturer: productData.manufacturer || '',
                    subGroup: productData.subGroup || '',
                    conversionFactor: productData.conversionFactor || 1,
                    lotNumber: parsed.lotNumber,
                    expiryDate: parsed.expiryDate,
                    quantity: parsed.quantity,
                    notes: '',
                    productNotFound: false,
                    lotStatus,
                    existingLotInfo
                });
            } else {
                notFoundIds.add(parsed.productId);
                newItems.push({
                    id: Date.now() + Math.random(),
                    productId: parsed.productId,
                    productName: '',
                    unit: '',
                    packaging: '',
                    storageTemp: '',
                    team: '',
                    manufacturer: '',
                    subGroup: '',
                    conversionFactor: 1,
                    lotNumber: parsed.lotNumber,
                    expiryDate: parsed.expiryDate,
                    quantity: parsed.quantity,
                    notes: '',
                    productNotFound: true,
                    lotStatus: 'declared',
                    existingLotInfo: null
                });
            }
        }

        useImportSlipStore.setState(state => ({
            ...state,
            items: newItems
        }));

        if (notFoundIds.size > 0) {
            toast.warn(
                `⚠️ Đọc PDF thành công! Có ${notFoundIds.size} mã hàng chưa tồn tại: ${[...notFoundIds].join(', ')}. Vui lòng kiểm tra các dòng màu vàng.`,
                { autoClose: 8000 }
            );
        } else {
            toast.success(
                `✅ Đọc PDF Pharmadesign thành công! Đã nhập ${parsedItems.length} dòng hàng. Vui lòng điều chỉnh số lượng theo đơn vị quy đổi.`
            );
        }

    } catch (error) {
        console.error("Lỗi khi đọc PDF Pharmadesign:", error);
        if (isDynamicChunkLoadError(error)) {
            toast.error("Ứng dụng vừa được cập nhật. Vui lòng tải lại trang (Ctrl+F5) rồi thử import PDF lại.");
        } else {
            toast.error("Không thể đọc file PDF. Vui lòng thử lại.");
        }
    } finally {
        setIsParsingPDF(false);
        if (pharmaPdfInputRef.current) pharmaPdfInputRef.current.value = '';
    }
};

const handleSchulkePDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        toast.warn("Vui lòng chọn file PDF hợp lệ.");
        return;
    }

    setIsParsingPDF(true);
    toast.info("Đang đọc Packing List Schulke...");

    try {
        const parsedItems = await parseSchulkePackingList(file);

        if (parsedItems.length === 0) {
            toast.error("Không tìm thấy dữ liệu hàng hóa. File có thể không đúng format Schulke.");
            return;
        }

        // Tra cứu mã hàng trong Firestore
        const uniqueProductIds = [...new Set(parsedItems.map(i => i.productId))];
        const productSnapshots = await Promise.all(
            uniqueProductIds.map(id => getDoc(doc(db, 'products', id)))
        );

        const productMap = {};
        productSnapshots.forEach(snap => {
            if (snap.exists()) productMap[snap.id] = snap.data();
        });

        const newItems = [];
        const notFoundIds = new Set();

        for (const parsed of parsedItems) {
            const productData = productMap[parsed.productId];

            // Kiểm tra lot đã tồn tại chưa
            let lotStatus = 'declared';
            let existingLotInfo = null;

            if (productData) {
                const lotQuery = query(
                    collection(db, 'inventory_lots'),
                    where('productId', '==', parsed.productId),
                    where('lotNumber', '==', parsed.lotNumber)
                );
                const lotSnapshot = await getDocs(lotQuery);
                if (!lotSnapshot.empty) {
                    let totalRemaining = 0;
                    let expiryDate = null;
                    lotSnapshot.forEach(d => {
                        totalRemaining += d.data().quantityRemaining || 0;
                        if (!expiryDate && d.data().expiryDate) expiryDate = d.data().expiryDate;
                    });
                    lotStatus = 'exists';
                    existingLotInfo = {
                        quantityRemaining: totalRemaining,
                        expiryDate: expiryDate ? formatDate(expiryDate.toDate()) : parsed.expiryDate
                    };
                }
            }

            if (productData) {
                newItems.push({
                    id: Date.now() + Math.random(),
                    productId: parsed.productId,
                    productName: productData.productName || '',
                    unit: productData.unit || '',
                    packaging: productData.packaging || '',
                    storageTemp: productData.storageTemp || '',
                    team: productData.team || '',
                    manufacturer: productData.manufacturer || '',
                    subGroup: productData.subGroup || '',
                    conversionFactor: productData.conversionFactor || 1,
                    lotNumber: parsed.lotNumber,
                    expiryDate: parsed.expiryDate,
                    quantity: parsed.quantity,
                    notes: '',
                    productNotFound: false,
                    lotStatus,
                    existingLotInfo
                });
            } else {
                notFoundIds.add(parsed.productId);
                newItems.push({
                    id: Date.now() + Math.random(),
                    productId: parsed.productId,
                    productName: '',
                    unit: '',
                    packaging: '',
                    storageTemp: '',
                    team: '',
                    manufacturer: '',
                    subGroup: '',
                    conversionFactor: 1,
                    lotNumber: parsed.lotNumber,
                    expiryDate: parsed.expiryDate,
                    quantity: parsed.quantity,
                    notes: '',
                    productNotFound: true,
                    lotStatus: 'declared',
                    existingLotInfo: null
                });
            }
        }

        useImportSlipStore.setState(state => ({
            ...state,
            items: newItems
        }));

        if (notFoundIds.size > 0) {
            toast.warn(
                `⚠️ Đọc PDF thành công! Có ${notFoundIds.size} mã hàng chưa tồn tại: ${[...notFoundIds].join(', ')}. Vui lòng kiểm tra các dòng màu vàng.`,
                { autoClose: 8000 }
            );
        } else {
            toast.success(
                `✅ Đọc PDF Schulke thành công! Đã nhập ${parsedItems.length} dòng hàng. Vui lòng điều chỉnh số lượng theo đơn vị quy đổi.`
            );
        }

    } catch (error) {
        console.error("Lỗi khi đọc PDF Schulke:", error);
        if (isDynamicChunkLoadError(error)) {
            toast.error("Ứng dụng vừa được cập nhật. Vui lòng tải lại trang (Ctrl+F5) rồi thử import PDF lại.");
        } else {
            toast.error("Không thể đọc file PDF. Vui lòng thử lại.");
        }
    } finally {
        setIsParsingPDF(false);
        if (schulkePdfInputRef.current) schulkePdfInputRef.current.value = '';
    }
};

    const handleSaveSlip = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;

        setIsSaving(true);
        try {
            const finalSlipData = { ...slipData, status: 'pending' };
            const docRef = await addDoc(collection(db, 'import_tickets'), finalSlipData);
            toast.success(`Lưu tạm phiếu nhập thành công! ID phiếu: ${docRef.id}`);
            resetSlip();
        } catch (error) {
            console.error("Lỗi khi lưu phiếu nhập: ", error);
            toast.error('Đã xảy ra lỗi khi lưu phiếu.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDirectImport = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;

        setConfirmModal({ isOpen: false });
        setIsSaving(true);
        try {
            const productIdsInSlip = [...new Set(slipData.items.map(item => item.productId))];
            const productPromises = productIdsInSlip.map(productId => getDoc(doc(db, 'products', productId.trim().toUpperCase())));
            const productSnapshots = await Promise.all(productPromises);

            const productDetailsMap = productSnapshots.reduce((acc, docSn) => {
                if (docSn.exists()) {
                    acc[docSn.id] = docSn.data();
                }
                return acc;
            }, {});

            const batch = writeBatch(db);

            for (const item of slipData.items) {
                const expiryDateObj = parseDateString(item.expiryDate);
                const expiryTimestamp = expiryDateObj ? Timestamp.fromDate(expiryDateObj) : null;

                const productDetails = productDetailsMap[item.productId.trim().toUpperCase()] || {};
                const subGroupValue = productDetails.subGroup || '';

                const newLotData = {
                    importDate: slipData.importDate ? (() => { const [d, m, y] = slipData.importDate.split('/'); return Timestamp.fromDate(new Date(Number(y), Number(m) - 1, Number(d))); })() : Timestamp.now(),
                    productId: item.productId,
                    productName: item.productName,
                    lotNumber: item.lotNumber,
                    expiryDate: expiryTimestamp,
                    unit: item.unit,
                    packaging: item.packaging,
                    storageTemp: item.storageTemp,
                    team: item.team,
                    manufacturer: item.manufacturer,
                    subGroup: subGroupValue,
                    quantityImported: Number(item.quantity),
                    quantityRemaining: Number(item.quantity),
                    notes: item.notes,
                    supplierName: slipData.supplierName,
                };
                const lotRef = doc(collection(db, "inventory_lots"));
                batch.set(lotRef, newLotData);
            }

            const finalSlipData = { ...slipData, status: 'completed' };
            const slipRef = doc(collection(db, 'import_tickets'));
            batch.set(slipRef, finalSlipData);

            // Cập nhật totalRemaining trên products (giống NewExportPage)
            const qtyByProduct = {};
            for (const item of slipData.items) {
                qtyByProduct[item.productId] = (qtyByProduct[item.productId] || 0) + Number(item.quantity);
            }
            for (const [pid, qty] of Object.entries(qtyByProduct)) {
                batch.update(doc(db, 'products', pid), { totalRemaining: increment(qty) });
            }

            await batch.commit();
            
            toast.success('Nhập kho trực tiếp thành công!');
            resetSlip();
        } catch (error) {
            console.error("Lỗi khi nhập kho trực tiếp: ", error);
            toast.error('Đã xảy ra lỗi khi nhập kho trực tiếp.');
        } finally {
            setIsSaving(false);
        }
    };

    const promptForDirectImport = () => {
        if (getValidSlipData()) {
            setConfirmModal({
                isOpen: true,
                title: "Xác nhận nhập kho trực tiếp?",
                message: "Thao tác này sẽ cập nhật tồn kho ngay lập tức và không thể hoàn tác. Bạn có chắc chắn muốn tiếp tục?",
                onConfirm: handleDirectImport
            });
        }
    };

    return (
        <div>
            <ConfirmationModal 
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal({ isOpen: false })}
                confirmText="Xác nhận"
            />
            {newProductModal.isOpen && (
                <AddNewProductAndLotModal
                    productId={newProductModal.productId}
                    onClose={() => setNewProductModal({ isOpen: false, productId: '', index: -1 })}
                    onSave={handleNewProductCreated}
                />
            )}
            {newLotModal.isOpen && (
                <AddNewLotModal
                    productId={items[newLotModal.index].productId}
                    productName={items[newLotModal.index].productName}
                    lotNumber={items[newLotModal.index].lotNumber}
                    onClose={() => setNewLotModal({ isOpen: false, index: -1 })}
                    onSave={handleNewLotDeclared}
                />
            )}

            <h1>Tạo Phiếu Nhập Kho</h1>
            <div className="form-section">
                <div className="form-row">
                    <div className="form-group">
                        <label>Ngày nhập</label>
                        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                            <input
                                type="text"
                                readOnly
                                value={importDate ? importDate.split('-').reverse().join('/') : ''}
                                style={{ paddingRight: '32px', cursor: 'pointer', backgroundColor: 'var(--input-bg, #fff)', color: 'var(--text-color)' }}
                                onClick={() => document.getElementById('import-date-picker').showPicker?.() || document.getElementById('import-date-picker').click()}
                            />
                            <input
                                id="import-date-picker"
                                type="date"
                                value={importDate}
                                onChange={e => setImportDate(e.target.value)}
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 1 }}
                            />
                            <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary, #666)', fontSize: '16px' }}>📅</span>
                        </div>
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                        <label>Nhà Cung Cấp (*)</label>
                        <SupplierAutocomplete
                            value={supplierName || supplierId}
                            onSelect={({ id, name }) => {
                                setSupplier(id, name);
                                if (!id && name) { 
                                    setSupplier(name, '');
                                }
                            }}
                            onBlur={() => {
                                if (!supplierId && supplierName) {
                                    handleSupplierSearch(supplierName);
                                }
                            }}
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label>Diễn giải</label>
                    <textarea rows="2" placeholder="Ghi chú cho phiếu nhập..." value={description} onChange={e => setDescription(e.target.value)}></textarea>
                </div>
            </div>

            {/* ===== NÚT IMPORT TỪ PACKING LIST PDF ===== */}
<div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '15px 0',
    padding: '12px 16px',
    backgroundColor: '#e8f4fd',
    borderRadius: '8px',
    border: '1px solid #b3d7f5',
    flexWrap: 'wrap'
}}>
    <FiUpload style={{ fontSize: '20px', color: '#007bff', flexShrink: 0 }} />
    <span style={{ fontSize: '14px', color: '#004085', flex: 1, minWidth: '200px' }}>
        <strong>Import từ Packing List:</strong> Tải file PDF lên để tự động điền dữ liệu
    </span>

    {/* Nút BD */}
    <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        onChange={handlePDFUpload}
        style={{ display: 'none' }}
        id="pdf-upload-bd"
    />
    <label
        htmlFor="pdf-upload-bd"
        style={{
            backgroundColor: isParsingPDF ? '#6c757d' : '#1565c0',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '5px',
            cursor: isParsingPDF ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: isParsingPDF ? 'none' : 'auto'
        }}
    >
        <FiUpload />
        {isParsingPDF ? 'Đang đọc...' : 'Import BD'}
    </label>

    {/* Nút ICU Medical */}
    <input
        ref={icuPdfInputRef}
        type="file"
        accept=".pdf"
        onChange={handleICUPDFUpload}
        style={{ display: 'none' }}
        id="pdf-upload-icu"
    />
    <label
        htmlFor="pdf-upload-icu"
        style={{
            backgroundColor: isParsingPDF ? '#6c757d' : '#2e7d32',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '5px',
            cursor: isParsingPDF ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: isParsingPDF ? 'none' : 'auto'
        }}
    >
        <FiUpload />
        {isParsingPDF ? 'Đang đọc...' : 'Import ICU Medical'}
    </label>

    {/* Nút Pharmadesign */}
    <input
        ref={pharmaPdfInputRef}
        type="file"
        accept=".pdf"
        onChange={handlePharmaPDFUpload}
        style={{ display: 'none' }}
        id="pdf-upload-pharma"
    />
    <label
        htmlFor="pdf-upload-pharma"
        style={{
            backgroundColor: isParsingPDF ? '#6c757d' : '#6a1b9a',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '5px',
            cursor: isParsingPDF ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: isParsingPDF ? 'none' : 'auto'
        }}
    >
        <FiUpload />
        {isParsingPDF ? 'Đang đọc...' : 'Import Pharmadesign'}
    </label>

    {/* Nút Schulke */}
    <input
        ref={schulkePdfInputRef}
        type="file"
        accept=".pdf"
        onChange={handleSchulkePDFUpload}
        style={{ display: 'none' }}
        id="pdf-upload-schulke"
    />
    <label
        htmlFor="pdf-upload-schulke"
        style={{
            backgroundColor: isParsingPDF ? '#6c757d' : '#c0392b',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '5px',
            cursor: isParsingPDF ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: isParsingPDF ? 'none' : 'auto'
        }}
    >
        <FiUpload />
        {isParsingPDF ? 'Đang đọc...' : 'Import Schulke'}
    </label>
</div>
{/* ===== KẾT THÚC NÚT IMPORT ===== */}

            <h2>Chi tiết hàng hóa</h2>
            <div className="item-details-grid" style={{ gridTemplateColumns: '1.2fr 2fr 1.1fr 1.2fr 0.8fr 1.5fr 1fr 1.5fr 1fr 1fr 0.5fr' }}>
                <div className="grid-header">Mã hàng (*)</div>
                <div className="grid-header">Tên hàng</div>
                <div className="grid-header">Số lô</div>
                <div className="grid-header">HSD</div>
                <div className="grid-header">ĐVT</div>
                <div className="grid-header">Quy cách</div>
                <div className="grid-header">Số lượng (*)</div>
                <div className="grid-header">Ghi chú</div>
                <div className="grid-header">Team</div>
                <div className="grid-header">Nhóm Hàng</div>
                <div className="grid-header">Xóa</div>

                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        <div className="grid-cell" style={{ 
    flexDirection: 'column', 
    alignItems: 'flex-start',
    backgroundColor: item.productNotFound ? '#fff3cd' : 'transparent',
    borderRadius: '4px'
}}>
    <ProductAutocomplete
                                ref={el => productInputRefs.current[index] = el}
                                value={item.productId}
                                onChange={(value) => updateItem(index, 'productId', value.toUpperCase())}
                                onSelect={(product) => handleProductSearch(index, product)}
                                onBlur={() => handleProductSearch(index, item.productId)}
                            />
                            {item.productNotFound && (
                                <button
                                    onClick={() => setNewProductModal({ isOpen: true, productId: item.productId, index: index })}
                                    className="btn-link"
                                    style={{ marginTop: '5px', color: '#007bff', cursor: 'pointer', background: 'none', border: 'none', padding: '0', textAlign: 'left', fontSize: '13px' }}
                                >
                                    Mã này không tồn tại. Tạo mới...
                                </button>
                            )}
                        </div>
                        <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
                        <div className="grid-cell" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                            <input
                                ref={el => lotNumberInputRefs.current[index] = el}
                                type="text"
                                value={item.lotNumber}
                                onChange={e => updateItem(index, 'lotNumber', e.target.value)}
                                onBlur={() => checkExistingLot(index)}
                                onKeyDown={e => handleLotNumberKeyDown(e, index)}
                            />
                            {item.lotStatus === 'exists' && item.existingLotInfo && (
                                <div className="existing-lot-info">
                                    <FiInfo />
                                    <span>Lô đã có | Tồn: {formatNumber(item.existingLotInfo.quantityRemaining)} | HSD: {item.existingLotInfo.expiryDate}</span>
                                </div>
                            )}
                            {item.lotStatus === 'new' && (
                                <button onClick={() => setNewLotModal({ isOpen: true, index: index })} className="btn-link" style={{marginTop: '5px'}}>
                                    [+] Khai báo lô mới...
                                </button>
                            )}
                        </div>
                        <div className="grid-cell">
                            <input 
                                type="text" 
                                placeholder="dd/mm/yyyy" 
                                value={item.expiryDate} 
                                onChange={e => updateItem(index, 'expiryDate', e.target.value)} 
                                onBlur={e => handleExpiryDateBlur(index, e.target.value)}
                                readOnly={item.lotStatus === 'exists'}
                                style={{backgroundColor: item.lotStatus === 'exists' ? '#f0f0f0' : '#fff', cursor: item.lotStatus === 'exists' ? 'not-allowed' : 'text'}}
                            />
                        </div>
                        <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
                        <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
                        <div className="grid-cell">
                            <input
                                ref={el => quantityInputRefs.current[index] = el}
                                type="text"
                                inputMode="numeric"
                                value={focusedInputIndex === index ? item.quantity : formatNumber(item.quantity)}
                                onFocus={() => setFocusedInputIndex(index)}
                                onBlur={() => setFocusedInputIndex(null)}
                                onKeyDown={handleQuantityKeyDown}
                                onChange={e => {
                                    const rawValue = e.target.value;
                                    const parsedValue = rawValue.replace(',', '.');
                                    if (/^\d*\.?\d*$/.test(parsedValue) || parsedValue === '') {
                                        updateItem(index, 'quantity', parsedValue);
                                    }
                                }}
                            />
                            {/* HIỂN THỊ SỐ KIỆN */}
{item.packaging && item.conversionFactor > 1 && (
    <div style={{ marginTop: '5px', fontSize: '12px', color: '#6c757d', textAlign: 'center' }}>
        Quy đổi: <strong>
            {/* LƯU Ý: LẤY ĐƠN VỊ VÀ KẾT QUẢ TỪ HÀM calculateCaseCount */}
            {formatNumber(calculateCaseCount(
                Number(item.quantity), 
                item.conversionFactor, 
                item.unit
            ).value)}
        </strong> 
        
        {/* ĐƠN VỊ HIỂN THỊ */}
        {calculateCaseCount(Number(item.quantity), item.conversionFactor, item.unit).action === 'MULTIPLY'
            ? getTargetUnit(item.packaging, item.unit) // Logic Lọ/Test
            : 'Thùng'} 
    </div>
)}
                        </div>
                        <div className="grid-cell"><textarea value={item.notes} onChange={e => updateItem(index, 'notes', e.target.value)} /></div>
                        <div className="grid-cell"><input type="text" value={item.team} readOnly /></div>
                        {/* ===== CHÈN KHỐI NÀY VÀO ĐÂY ===== */}
<div className="grid-cell"> {/* Nhóm Hàng */}
    <input
        type="text"
        value={item.subGroup || ''}
        onChange={e => updateItem(index, 'subGroup', e.target.value)}
        // readOnly // Bỏ comment nếu không cho sửa
        title={item.subGroup ? `Nhóm hàng: ${item.subGroup}` : "Nhóm hàng sẽ tự điền"}
        style={{ backgroundColor: item.subGroup ? '#f0f0f0' : '#fff' }}
    />
</div>
{/* ===== KẾT THÚC KHỐI CHÈN ===== */}
                        <div className="grid-cell">
                            <button 
                                type="button" 
                                className="btn-icon btn-delete" 
                                onClick={() => handleRemoveRow(index)}
                                title="Xóa dòng này"
                            >
                                <FiXCircle />
                            </button>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            <button ref={addRowButtonRef} onClick={addNewItemRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
            
            <div className="page-actions">
                <button 
                    onClick={handleSaveSlip} 
                    className="btn-secondary" 
                    disabled={isSaving || !isSlipValid}
                    title={!isSlipValid ? disabledReason : 'Lưu phiếu dưới dạng bản nháp'}
                >
                    {isSaving ? 'Đang lưu...' : 'Lưu Tạm'}
                </button>
                
                <button 
                    onClick={promptForDirectImport} 
                    className="btn-primary" 
                    disabled={isSaving || !isSlipValid}
                    title={!isSlipValid ? disabledReason : 'Nhập hàng và cập nhật tồn kho ngay lập tức'}
                >
                    {isSaving ? 'Đang xử lý...' : 'Nhập Kho Trực Tiếp'}
                </button>
            </div>
        </div>
    );
};

export default NewImportPage;