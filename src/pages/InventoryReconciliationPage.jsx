// src/pages/InventoryReconciliationPage.jsx
import { useState } from 'react';
import React, { useMemo, useRef } from 'react';
import useReconciliationStore from '../stores/reconciliationStore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { FiUpload, FiDownload, FiRefreshCw, FiAlertCircle, FiXCircle } from 'react-icons/fi';

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function fmtNum(val) {
    if (val === null || val === undefined || val === '') return '';
    const n = Number(val);
    if (isNaN(n)) return String(val);
    if (n === Math.floor(n)) return n.toLocaleString('vi-VN');
    const s = parseFloat(n.toPrecision(10)).toString();
    return s.replace(/\.?0+$/, '');
}

function fmtChenh(val, unit) {
    if (val === null || val === undefined || val === '') return '';
    const n = Number(val);
    if (isNaN(n) || n === 0) return '';
    const sign = n > 0 ? '+' : '';
    return `${sign}${fmtNum(Math.abs(n))}${unit ? ' ' + unit : ''}`;
}

function normLot(s) {
    if (!s) return '';
    return String(s).trim().toUpperCase().replace(/^0+/, '') || '';
}

function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) {
        if (isNaN(v.getTime())) return null;
        // Tránh lệch timezone: dùng UTC components
        return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
    }
    if (typeof v === 'number') {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isNaN(d.getTime()) ? null : d;
    }
    const s = String(v).trim();
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function isExpired(dateVal) {
    const d = parseDate(dateVal);
    if (!d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
}

function fmtDateDisplay(dateVal) {
    const d = parseDate(dateVal);
    if (!d) return '';
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// ============================================================
// PARSE FILE EXCEL MISA
// ============================================================
function parseMisaExcel(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map(c => String(c).trim());
        if (row.some(c => c === 'Mã hàng') && row.some(c => c.includes('Số lô') || c.includes('lô'))) {
            headerIdx = i;
            break;
        }
    }
    if (headerIdx === -1) throw new Error('Không tìm thấy header trong file Misa. Cần có cột "Mã hàng" và "Số lô".');

    const headers = rows[headerIdx].map(c => String(c).trim());
    const idxMa    = headers.findIndex(h => h === 'Mã hàng');
    const idxLo    = headers.findIndex(h => h.includes('Số lô') || h === 'Lô');
    const idxHsd   = headers.findIndex(h => h.includes('Hạn') || h.includes('hạn'));
    const idxDvt   = headers.findIndex(h => h === 'ĐVT' || h.includes('vị tính'));
    const idxSl    = headers.findIndex(h => h.includes('Cuối') || h.includes('Số lượng') || h.includes('Tồn'));

    if (idxMa === -1 || idxLo === -1) throw new Error('File thiếu cột "Mã hàng" hoặc "Số lô".');

    const items = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const ma = String(row[idxMa] || '').trim();
        if (!ma || ma.toLowerCase().includes('mã kho') || ma.toLowerCase().includes('tổng')) continue;

        const lo  = String(row[idxLo] || '').trim();
        const hsd = idxHsd >= 0 ? row[idxHsd] : null;
        const dvt = idxDvt >= 0 ? String(row[idxDvt] || '').trim() : '';
        const sl  = idxSl >= 0 ? Number(row[idxSl]) || 0 : 0;

        if (isExpired(hsd)) continue;
        if (sl <= 0) continue;

        items.push({ ma, lo, hsdRaw: hsd, dvt, sl, lotKey: normLot(lo) });
    }

    // Cộng dồn lot trùng + phát hiện lot có 2 HSD khác nhau
    const merged = new Map();
    const duplicateHsd = [];

    for (const item of items) {
        const key = `${item.ma}__${item.lotKey}`;
        if (merged.has(key)) {
            const existing = merged.get(key);
            existing.sl += item.sl;
            const hsd1 = fmtDateDisplay(existing.hsdRaw);
            const hsd2 = fmtDateDisplay(item.hsdRaw);
            if (hsd1 && hsd2 && hsd1 !== hsd2) {
                const alreadyWarned = duplicateHsd.some(d => d.ma === item.ma && d.lo === item.lo);
                if (!alreadyWarned) {
                    duplicateHsd.push({ ma: item.ma, lo: item.lo, hsd1, hsd2 });
                }
            }
        } else {
            merged.set(key, { ...item });
        }
    }
    return { items: [...merged.values()], duplicateHsd };
}

// ============================================================
// TABS CONFIG
// ============================================================
const TABS = [
    { key: 'chenh',    label: 'Chênh lệch',     color: '#c0392b', bgColor: '#fff5f5' },
    { key: 'khop',     label: 'Khớp',            color: '#27ae60', bgColor: '#f0fff4' },
    { key: 'webkho',   label: 'Chỉ WebKho',      color: '#d68910', bgColor: '#fffde7' },
    { key: 'misa',     label: 'Chỉ Misa',         color: '#ca6f1e', bgColor: '#fff3e0' },
    { key: 'nomisa',   label: 'Misa thiếu mã',   color: '#922b21', bgColor: '#fdecea' },
];

// ============================================================
// COMPONENT CHÍNH
// ============================================================
const InventoryReconciliationPage = () => {
    const [stockModal, setStockModal] = useState({ isOpen: false, productId: '', data: [] , loading: false });

const openStockModal = async (productId) => {
    setStockModal({ isOpen: true, productId, data: [], loading: true });
    try {
        const q = query(
            collection(db, 'inventory_lots'),
            where('productId', '==', productId.trim().toUpperCase()),
            where('quantityRemaining', '>', 0)
        );
        const snap = await getDocs(q);
        const lots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        lots.sort((a, b) => {
            const da = a.expiryDate?.toDate?.() || new Date(9999,0,1);
            const db2 = b.expiryDate?.toDate?.() || new Date(9999,0,1);
            return da - db2;
        });
        setStockModal({ isOpen: true, productId, data: lots, loading: false });
    } catch (e) {
        setStockModal({ isOpen: true, productId, data: [], loading: false });
    }
};

const closeStockModal = () => setStockModal({ isOpen: false, productId: '', data: [], loading: false });
    // ── Store: giữ nguyên dữ liệu khi chuyển trang ──
    const {
        webkhoLots, convMap, altCodeMap, missingMisaCodes, lastUpdated,
        misaItems, misaFileName, duplicateHsdWarnings,
        activeTab,
        setWebkhoData, setMisaData, setActiveTab, reset,
    } = useReconciliationStore();

    // missingMisaCodes lưu array trong store → chuyển Set khi dùng
    const missingMisaCodesSet = useMemo(() => new Set(missingMisaCodes), [missingMisaCodes]);

    // State cục bộ (không cần giữ khi chuyển trang)
    const [isLoadingWebkho, setIsLoadingWebkho] = React.useState(false);
    const [search, setSearch]                   = React.useState('');

    const fileInputRef = useRef(null);

    // ============================================================
    // LOAD DỮ LIỆU TỪ FIRESTORE
    // ============================================================
    const loadWebkhoData = async () => {
        setIsLoadingWebkho(true);
        toast.info('Đang tải dữ liệu WebKho...');
        try {
            // Load inventory_lots
            const lotsSnap = await getDocs(collection(db, 'inventory_lots'));
            const rawLots = [];
            lotsSnap.forEach(doc => {
                const d = doc.data();
                if (!d.productId) return;
                const lotNumber = d.lotNumber || '';
                rawLots.push({
                    productId: d.productId,
                    lotNumber,
                    expiryDate: d.expiryDate ? (d.expiryDate.toDate ? d.expiryDate.toDate() : d.expiryDate) : null,
                    quantityRemaining: d.quantityRemaining || 0,
                    unit: d.unit || '',
                });
            });

            // Cộng dồn các lot trùng
            const lotMap = new Map();
            for (const lot of rawLots) {
                if (isExpired(lot.expiryDate)) continue;
                if (lot.quantityRemaining <= 0) continue;
                const key = `${lot.productId}__${lot.lotNumber}`;
                if (lotMap.has(key)) {
                    lotMap.get(key).quantityRemaining += lot.quantityRemaining;
                } else {
                    lotMap.set(key, { ...lot, lotKey: normLot(lot.lotNumber) });
                }
            }
            const finalLots = [...lotMap.values()];

            // Load conversion factors từ products
            const prodsSnap = await getDocs(collection(db, 'products'));
            const newConvMap = {};
            const newMissingSet = new Set();
            const newAltMap = {};
            prodsSnap.forEach(doc => {
                const d = doc.data();
                const id = doc.id;
                if (d.misaConversionFactor != null) {
                    newConvMap[id] = Number(d.misaConversionFactor) || 1;
                }
                if (d.misaCode && d.misaCode !== id) {
                    newAltMap[id] = d.misaCode;
                }
                if (d.missingFromMisa === true) {
                    newMissingSet.add(id);
                }
            });

            setWebkhoData(finalLots, newConvMap, newAltMap, [...newMissingSet]);
            toast.success(`Đã tải ${finalLots.length} lot từ WebKho!`);
        } catch (err) {
            console.error(err);
            toast.error('Lỗi khi tải dữ liệu WebKho: ' + err.message);
        } finally {
            setIsLoadingWebkho(false);
        }
    };

    // ============================================================
    // UPLOAD FILE MISA
    // ============================================================
    const handleMisaUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const { items, duplicateHsd } = parseMisaExcel(buf);
            setMisaData(items, file.name, duplicateHsd);
            if (duplicateHsd.length > 0) {
                toast.warn(`⚠️ Có ${duplicateHsd.length} lot trong Misa bị trùng số lô nhưng khác HSD!`);
            }
            toast.success(`Đã đọc ${items.length} lot từ file Misa!`);
        } catch (err) {
            toast.error('Lỗi đọc file: ' + err.message);
            setMisaData([], '', []);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ============================================================
    // ĐỐI CHIẾU
    // ============================================================
    const { results, counts } = useMemo(() => {
        if (!webkhoLots.length && !misaItems.length) {
            return { results: [], counts: {} };
        }

        // Build Misa lookup: (maHang, lotKey) -> item
        const misaLookup = new Map();
        for (const item of misaItems) {
            const key = `${item.ma}__${item.lotKey}`;
            misaLookup.set(key, item);
        }

        // Build product name map
        const results = [];

        // Misa keys đã được match (để tìm "chỉ Misa")
        const matchedMisaKeys = new Set();

        // Xử lý từng lot WebKho
        for (const lot of webkhoLots) {
            const misaCode = altCodeMap[lot.productId] || lot.productId;
            const heySo = convMap[lot.productId] ?? 1;
            const qtyWebkhoQd = lot.quantityRemaining * heySo;

            const misaKey = `${misaCode}__${lot.lotKey}`;
            const misaItem = misaLookup.get(misaKey);

            let status, nhom, chenhWebkho, chenhMisa, dvtMisa, tonMisa, hsdMisa;

            if (misaItem) {
                matchedMisaKeys.add(misaKey);
                dvtMisa = misaItem.dvt;
                tonMisa = misaItem.sl;
                hsdMisa = fmtDateDisplay(misaItem.hsdRaw);
                const diff = qtyWebkhoQd - tonMisa;
                chenhWebkho = diff / heySo; // quy ngược về ĐVT WebKho
                chenhMisa   = heySo !== 1 ? diff : null;

                if (Math.abs(diff) < 0.001) {
                    nhom = 'khop'; status = '✅ Khớp';
                } else if (diff > 0) {
                    nhom = 'chenh'; status = '⬆️ WebKho cao hơn';
                } else {
                    nhom = 'chenh'; status = '⬇️ WebKho thấp hơn';
                }
            } else {
                dvtMisa = ''; tonMisa = null; hsdMisa = '';
                chenhWebkho = null; chenhMisa = null;
                if (missingMisaCodesSet.has(lot.productId)) {
                    nhom = 'nomisa'; status = '🔴 Misa chưa có mã';
                } else {
                    nhom = 'webkho'; status = '🟡 Chỉ có trên WebKho';
                }
            }

            results.push({
                nhom,
                productId:   lot.productId,
                lotNumber:   lot.lotNumber,
                hsdWebkho:   fmtDateDisplay(lot.expiryDate),
                dvtWebkho:   lot.unit,
                tonWebkho:   lot.quantityRemaining,
                heySo,
                tonWebkhoQd: qtyWebkhoQd,
                dvtMisa,
                tonMisa,
                hsdMisa,
                chenhWebkho,
                chenhMisa,
                status,
            });
        }

        // Lot chỉ có trên Misa (chưa được match)
        for (const item of misaItems) {
            const key = `${item.ma}__${item.lotKey}`;
            if (!matchedMisaKeys.has(key)) {
                results.push({
                    nhom:       'misa',
                    productId:  item.ma,
                    lotNumber:  item.lo,
                    hsdWebkho:  '',
                    dvtWebkho:  '',
                    tonWebkho:  null,
                    heySo:      null,
                    tonWebkhoQd: null,
                    dvtMisa:    item.dvt,
                    tonMisa:    item.sl,
                    hsdMisa:    fmtDateDisplay(item.hsdRaw),
                    chenhWebkho: null,
                    chenhMisa:  null,
                    status:     '🟠 Chỉ có trên Misa',
                });
            }
        }

        // Đếm theo nhóm
        const counts = {};
        for (const r of results) {
            counts[r.nhom] = (counts[r.nhom] || 0) + 1;
        }

        // Sort chênh lệch theo |chênh| giảm dần
        results.sort((a, b) => {
            if (a.nhom !== b.nhom) return 0;
            if (a.nhom === 'chenh') {
                return Math.abs(b.chenhWebkho || 0) - Math.abs(a.chenhWebkho || 0);
            }
            return 0;
        });

        return { results, counts };
    }, [webkhoLots, misaItems, convMap, altCodeMap, missingMisaCodes]);

    // ============================================================
    // LỌC THEO TAB + SEARCH
    // ============================================================
    const filtered = useMemo(() => {
        let rows = results.filter(r => r.nhom === activeTab);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            rows = rows.filter(r =>
                r.productId.toLowerCase().includes(q) ||
                (r.lotNumber || '').toLowerCase().includes(q)
            );
        }
        return rows;
    }, [results, activeTab, search]);

    // ============================================================
    // XUẤT EXCEL
    // ============================================================
    const handleExport = () => {
        if (!results.length) { toast.warn('Chưa có dữ liệu để xuất.'); return; }
        const wb = XLSX.utils.book_new();
        const COLS = ['Mã hàng','Số lot','HSD WebKho','ĐVT WebKho','Tồn WebKho',
                      'Hệ số','Tồn WebKho (quy đổi)','ĐVT Misa','Tồn Misa','HSD Misa',
                      'Chênh (ĐVT WebKho)','Chênh (ĐVT Misa)','Trạng thái'];

        const tabOrder = ['chenh','khop','webkho','misa','nomisa'];
        const tabLabel = { chenh:'Chênh lệch', khop:'Khớp', webkho:'Chỉ WebKho', misa:'Chỉ Misa', nomisa:'Misa thiếu mã' };

        for (const tab of tabOrder) {
            const rows = results.filter(r => r.nhom === tab);
            if (!rows.length) continue;
            const data = [COLS, ...rows.map(r => [
                r.productId, r.lotNumber, r.hsdWebkho, r.dvtWebkho,
                r.tonWebkho ?? '', r.heySo ?? '', r.tonWebkhoQd ?? '',
                r.dvtMisa, r.tonMisa ?? '', r.hsdMisa,
                r.chenhWebkho != null ? fmtChenh(r.chenhWebkho, r.dvtWebkho) : '',
                r.chenhMisa   != null ? fmtChenh(r.chenhMisa,   r.dvtMisa)   : '',
                r.status,
            ])];
            const ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, tabLabel[tab]);
        }

        const now = new Date();
        const stamp = `${now.getDate().toString().padStart(2,'0')}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getFullYear()}`;
        XLSX.writeFile(wb, `doi_chieu_ton_kho_${stamp}.xlsx`);
        toast.success('Đã xuất file Excel!');
    };

    // ============================================================
    // RENDER
    // ============================================================
    const hasData = webkhoLots.length > 0 || misaItems.length > 0;
    const canReconcile = webkhoLots.length > 0 && misaItems.length > 0;

    return (
        <div style={{ padding: '20px' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '600' }}>Đối chiếu tồn kho WebKho vs Misa</h1>
                    {lastUpdated && (
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {(() => { const d = lastUpdated ? new Date(lastUpdated) : null; return d ? `Dữ liệu WebKho: ${fmtDateDisplay(d)} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''; })()}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={loadWebkhoData}
                        disabled={isLoadingWebkho}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}
                    >
                        <FiRefreshCw style={{ fontSize: '14px', animation: isLoadingWebkho ? 'spin 1s linear infinite' : 'none' }} />
                        {isLoadingWebkho ? 'Đang tải...' : webkhoLots.length ? 'Cập nhật WebKho' : 'Tải dữ liệu WebKho'}
                    </button>

                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleMisaUpload} style={{ display: 'none' }} id="misa-upload" />
                    <label
                        htmlFor="misa-upload"
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer', padding: '10px 15px', borderRadius: '5px' }}
                    >
                        <FiUpload style={{ fontSize: '14px' }} />
                        {misaFileName ? `Misa: ${misaFileName.length > 20 ? misaFileName.substring(0,20)+'...' : misaFileName}` : 'Upload file Misa'}
                    </label>

                    {canReconcile && (
                        <button
                            onClick={handleExport}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', backgroundColor: '#2c7a4e', color: 'white', border: 'none' }}
                        >
                            <FiDownload style={{ fontSize: '14px' }} />
                            Xuất Excel
                        </button>
                    )}

                    {hasData && (
                        <button
                            onClick={() => { if (window.confirm('Xóa toàn bộ dữ liệu đối chiếu hiện tại?')) reset(); }}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', backgroundColor: '#e74c3c', color: 'white', border: 'none' }}
                        >
                            <FiAlertCircle style={{ fontSize: '14px' }} />
                            Hủy đối chiếu
                        </button>
                    )}
                </div>
                {/* MODAL XEM TỒN KHO NHANH */}
{stockModal.isOpen && (
    <div onClick={closeStockModal} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
        <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-color, #fff)', borderRadius: '12px',
            padding: '24px', width: '600px', maxWidth: '90vw',
            maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Tồn kho: {stockModal.productId}</h3>
                <button onClick={closeStockModal} style={{
                    background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer'
                }}>✕</button>
            </div>

            {stockModal.loading ? (
                <p style={{ textAlign: 'center', color: '#888' }}>Đang tải...</p>
            ) : stockModal.data.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#888' }}>Không có tồn kho.</p>
            ) : (
                <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                                <th style={{ padding: '8px' }}>Số lô</th>
                                <th style={{ padding: '8px' }}>HSD</th>
                                <th style={{ padding: '8px', textAlign: 'right' }}>Tồn thực</th>
                                <th style={{ padding: '8px', textAlign: 'right' }}>Đặt giữ</th>
                                <th style={{ padding: '8px', textAlign: 'right' }}>Khả dụng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stockModal.data.map(lot => {
                                const allocated = lot.quantityAllocated || 0;
                                const available = lot.quantityRemaining - allocated;
                                return (
                                    <tr key={lot.id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '8px' }}>{lot.lotNumber || '(Không có)'}</td>
                                        <td style={{ padding: '8px' }}>
                                            {lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                                            {formatNumber(lot.quantityRemaining)}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right', color: '#e67e22' }}>
                                            {allocated > 0 ? formatNumber(allocated) : '-'}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right', color: 'green', fontWeight: 'bold' }}>
                                            {formatNumber(available)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #ddd', fontWeight: 'bold' }}>
                                <td colSpan={2} style={{ padding: '8px' }}>Tổng</td>
                                <td style={{ padding: '8px', textAlign: 'right' }}>
                                    {formatNumber(stockModal.data.reduce((s, l) => s + l.quantityRemaining, 0))}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'right', color: '#e67e22' }}>
                                    {formatNumber(stockModal.data.reduce((s, l) => s + (l.quantityAllocated || 0), 0))}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'right', color: 'green' }}>
                                    {formatNumber(stockModal.data.reduce((s, l) => s + (l.quantityRemaining - (l.quantityAllocated || 0)), 0))}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </>
            )}
        </div>
    </div>
)}
            </div>

            {/* CẢNH BÁO LOT TRÙNG SỐ LÔ NHƯNG KHÁC HSD */}
            {duplicateHsdWarnings.length > 0 && (
                <div style={{
                    backgroundColor: '#fff8e1',
                    border: '1px solid #f9a825',
                    borderLeft: '4px solid #f9a825',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                }}>
                    <div style={{ fontWeight: '600', color: '#e65100', marginBottom: '8px', fontSize: '14px' }}>
                        ⚠️ Phát hiện {duplicateHsdWarnings.length} lot trong Misa có cùng số lô nhưng khác HSD — cần kiểm tra lại trên Misa!
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#fff3cd' }}>
                                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #f9a825' }}>Mã hàng</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #f9a825' }}>Số lô</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #f9a825' }}>HSD dòng 1</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #f9a825' }}>HSD dòng 2</th>
                            </tr>
                        </thead>
                        <tbody>
                            {duplicateHsdWarnings.map((w, i) => (
                                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fffde7' : '#fff8e1' }}>
                                    <td style={{ padding: '5px 10px', fontWeight: '600', color: '#333' }}>{w.ma}</td>
                                    <td style={{ padding: '5px 10px', color: '#555' }}>{w.lo}</td>
                                    <td style={{ padding: '5px 10px', color: '#c0392b' }}>{w.hsd1}</td>
                                    <td style={{ padding: '5px 10px', color: '#c0392b' }}>{w.hsd2}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#795548' }}>
                        💡 Số lượng tồn kho đã được cộng dồn lại — chỉ cần sửa HSD đúng trên Misa rồi xuất file mới để đối chiếu lại.
                    </div>
                </div>
            )}

            {/* HƯỚNG DẪN NẾU CHƯA CÓ DỮ LIỆU */}
            {!hasData && (
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '32px', textAlign: 'center' }}>
                    <FiAlertCircle style={{ fontSize: '48px', color: 'var(--text-secondary)', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 8px', color: 'var(--text-color)' }}>Chưa có dữ liệu</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Bước 1: Bấm <strong>Tải dữ liệu WebKho</strong> để lấy tồn kho hiện tại<br />
                        Bước 2: Tải file Excel tồn kho từ Misa về máy<br />
                        Bước 3: Bấm <strong>Upload file Misa</strong> để đối chiếu
                    </p>
                </div>
            )}

            {/* BẢNG THỐNG KÊ */}
            {canReconcile && (
                <>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {TABS.map(tab => (
                            <div
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    border: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                                    backgroundColor: activeTab === tab.key ? tab.bgColor : 'var(--card-bg)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                    minWidth: '100px',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <div style={{ fontSize: '22px', fontWeight: '700', color: tab.color }}>{counts[tab.key] || 0}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{tab.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* SEARCH */}
                    <div style={{ marginBottom: '12px' }}>
                        <input
                            type="text"
                            placeholder="Tìm theo mã hàng hoặc số lot..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)',
                                backgroundColor: 'var(--input-bg)', color: 'var(--text-color)',
                                fontSize: '14px', width: '300px', maxWidth: '100%',
                            }}
                        />
                        <span style={{ marginLeft: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {filtered.length} kết quả
                        </span>
                    </div>

                    {/* BẢNG KẾT QUẢ */}
                    <div style={{ overflowX: 'auto', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--table-header-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                                    {['Mã hàng','Số lot','HSD WebKho','ĐVT WebKho','Tồn WebKho','Hệ số','Tồn (quy đổi)','ĐVT Misa','Tồn Misa','HSD Misa','Chênh (ĐVT WebKho)','Chênh (ĐVT Misa)','Trạng thái'].map(h => (
                                        <th key={h} style={{
                                            padding: '10px 12px', textAlign: 'left', fontWeight: '600',
                                            fontSize: '12px', color: 'var(--text-color)',
                                            borderBottom: '2px solid var(--border-color)', whiteSpace: 'nowrap',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={13} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            Không có dữ liệu
                                        </td>
                                    </tr>
                                ) : filtered.map((r, i) => {
                                    const rowBg = i % 2 === 0 ? 'var(--card-bg)' : 'var(--table-stripe-bg)';
                                    const chenhColor = r.chenhWebkho > 0 ? '#e67e22' : r.chenhWebkho < 0 ? '#e74c3c' : 'inherit';
                                    return (
                                        <tr key={i} style={{ backgroundColor: rowBg }}>
                                            <td style={tdStyle}>
    <button
        onClick={() => openStockModal(r.productId)}
        style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#007bff', textDecoration: 'underline', fontWeight: 'bold',
            fontSize: 'inherit', padding: 0
        }}
        title="Bấm để xem tồn kho chi tiết"
    >
        {r.productId}
    </button>
</td>
                                            <td style={tdStyle}>{r.lotNumber}</td>
                                            <td style={tdStyle}>{r.hsdWebkho}</td>
                                            <td style={tdStyle}>{r.dvtWebkho}</td>
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>{r.tonWebkho != null ? fmtNum(r.tonWebkho) : ''}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{r.heySo != null ? fmtNum(r.heySo) : ''}</td>
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>{r.tonWebkhoQd != null ? fmtNum(r.tonWebkhoQd) : ''}</td>
                                            <td style={tdStyle}>{r.dvtMisa}</td>
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>{r.tonMisa != null ? fmtNum(r.tonMisa) : ''}</td>
                                            <td style={tdStyle}>{r.hsdMisa}</td>
                                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600', color: chenhColor }}>
                                                {r.chenhWebkho != null ? fmtChenh(r.chenhWebkho, r.dvtWebkho) : ''}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)' }}>
                                                {r.chenhMisa != null ? fmtChenh(r.chenhMisa, r.dvtMisa) : ''}
                                            </td>
                                            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{r.status}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* CHỈ CÓ 1 TRONG 2 */}
            {(webkhoLots.length > 0 && !misaItems.length) && (
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Đã tải <strong>{webkhoLots.length} lot</strong> từ WebKho. Hãy upload file Misa để bắt đầu đối chiếu.
                    </p>
                </div>
            )}
            {(!webkhoLots.length && misaItems.length > 0) && (
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Đã đọc <strong>{misaItems.length} lot</strong> từ Misa. Hãy tải dữ liệu WebKho để bắt đầu đối chiếu.
                    </p>
                </div>
            )}

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

const tdStyle = {
    padding: '9px 12px',
    borderBottom: '1px solid var(--border-color)',
    color: 'var(--text-color)',
    whiteSpace: 'nowrap',
};

export default InventoryReconciliationPage;