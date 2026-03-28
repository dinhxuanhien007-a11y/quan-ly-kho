// src/pages/InventoryReconciliationPage.jsx
import { useState } from 'react';
import React, { useMemo, useRef } from 'react';
import useReconciliationStore from '../stores/reconciliationStore';
// FIX 1: Xóa orderBy thừa
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import { toast } from 'react-toastify';
import { FiUpload, FiDownload, FiRefreshCw, FiAlertCircle, FiClock } from 'react-icons/fi';

let xlsxModulePromise;
const loadXLSX = async () => {
    if (!xlsxModulePromise) {
        xlsxModulePromise = import('xlsx');
    }
    return xlsxModulePromise;
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function fmtNum(val) {
    if (val === null || val === undefined || val === '') return '';
    const n = Number(val);
    if (isNaN(n)) return String(val);
    
    // Làm tròn đến 2 chữ số thập phân để tránh lỗi floating point
    const rounded = Math.round(n * 100) / 100;
    
    // Nếu là số nguyên, hiển thị không có phần thập phân
    if (rounded === Math.floor(rounded)) return rounded.toLocaleString('vi-VN');
    
    // Nếu có phần thập phân, hiển thị và loại bỏ số 0 thừa
    return rounded.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
    
    // ✅ Xử lý Firestore Timestamp
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
        const firebaseDate = v.toDate();
        const year = firebaseDate.getFullYear();
        const month = firebaseDate.getMonth();
        const day = firebaseDate.getDate();
        return new Date(year, month, day);
    }
    
    // ✅ Xử lý Date object (từ Excel) - KHÔNG dùng getUTC...()
    if (v instanceof Date) {
        if (isNaN(v.getTime())) return null;
        // Lấy ngày theo LOCAL timezone
        const year = v.getFullYear();
        const month = v.getMonth();
        const day = v.getDate();
        return new Date(year, month, day);
    }
    
    // Xử lý số (Excel serial date)
    if (typeof v === 'number') {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isNaN(d.getTime()) ? null : d;
    }
    
    // Xử lý string
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
    if (!dateVal) return '';
    
    // Nếu là Firestore Timestamp
    if (typeof dateVal === 'object' && typeof dateVal.toDate === 'function') {
        const firebaseDate = dateVal.toDate();
        const year = firebaseDate.getFullYear();
        const month = firebaseDate.getMonth() + 1;
        const day = firebaseDate.getDate();
        return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
    }
    
    // Nếu là Date object
    if (dateVal instanceof Date) {
        if (isNaN(dateVal.getTime())) return '';
        const year = dateVal.getFullYear();
        const month = dateVal.getMonth() + 1;
        const day = dateVal.getDate();
        return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
    }
    
    // Nếu là string (DD/MM/YYYY)
    if (typeof dateVal === 'string') {
        const s = dateVal.trim();
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return `${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${m[3]}`;
        return s;
    }
    
    // Nếu là số (Excel serial date)
    if (typeof dateVal === 'number') {
        const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        if (isNaN(d.getTime())) return '';
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const day = d.getDate();
        return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
    }
    
    // Fallback: parse rồi display
    const d = parseDate(dateVal);
    if (!d) return '';
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`;
}

// FIX/CẢI TIẾN 3: Badge cảnh báo HSD sắp hết hạn (≤30, ≤60, ≤90 ngày)
function getExpiryBadge(dateVal) {
    const d = parseDate(dateVal);
    if (!d) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.floor((d - today) / (1000 * 60 * 60 * 24));
    if (days < 0) return null; // đã hết hạn (đã bị lọc bỏ khi load)
    if (days <= 30) return { bg: '#fdecea', color: '#c0392b', border: '#e74c3c', label: `${days}N` };
    if (days <= 60) return { bg: '#fff3e0', color: '#e65100', border: '#ff9800', label: `${days}N` };
    if (days <= 90) return { bg: '#fffde7', color: '#f57f17', border: '#fbc02d', label: `${days}N` };
    return null;
}

// ============================================================
// PARSE FILE EXCEL MISA
// ============================================================
async function parseMisaExcel(arrayBuffer) {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map(c => String(c).trim());
        if (row.some(c => c === 'Mã hàng') && row.some(c => c.includes('Số lô') || c.includes('lô'))) {
            headerIdx = i; break;
        }
    }
    if (headerIdx === -1) throw new Error('Không tìm thấy header trong file Misa. Cần có cột "Mã hàng" và "Số lô".');

    const headers = rows[headerIdx].map(c => String(c).trim());
    const idxMa  = headers.findIndex(h => h === 'Mã hàng');
    const idxLo  = headers.findIndex(h => h.includes('Số lô') || h === 'Lô');
    const idxHsd = headers.findIndex(h => h.includes('Hạn') || h.includes('hạn'));
    const idxDvt = headers.findIndex(h => h === 'ĐVT' || h.includes('vị tính'));
    const idxSl  = headers.findIndex(h => h.includes('Cuối') || h.includes('Số lượng') || h.includes('Tồn'));

    if (idxMa === -1 || idxLo === -1) throw new Error('File thiếu cột "Mã hàng" hoặc "Số lô".');

    const items = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const ma = String(row[idxMa] || '').trim();
    if (!ma || ma.toLowerCase().includes('mã kho') || ma.toLowerCase().includes('tổng')) continue;
    const lo  = String(row[idxLo] || '').trim();
    
    // Xử lý HSD từ Excel - Chuyển đổi Excel serial date
    let hsd = idxHsd >= 0 ? row[idxHsd] : null;
    
    if (hsd) {
        // Nếu là số (Excel serial date)
        if (typeof hsd === 'number') {
            // Chuyển đổi Excel serial date sang ngày thực
            // Excel serial date: số ngày kể từ 1/1/1900
            // Excel có bug: tính 1900 là năm nhuận (nhưng thực tế không phải)
            const daysFrom1900 = hsd - 1; // Trừ 1 vì Excel đếm từ 1, không phải 0
            const msPerDay = 24 * 60 * 60 * 1000;
            
            // Tạo Date từ 1/1/1900 theo UTC
            const excelEpoch = Date.UTC(1900, 0, 1);
            const dateMs = excelEpoch + (daysFrom1900 - 1) * msPerDay; // Trừ thêm 1 để bù bug năm nhuận
            const date = new Date(dateMs);
            
            // Lấy ngày theo UTC để tránh vấn đề múi giờ
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            hsd = `${day}/${month}/${year}`;
        }
        // Nếu là Date object
        else if (hsd instanceof Date && !isNaN(hsd.getTime())) {
            const year = hsd.getFullYear();
            const month = String(hsd.getMonth() + 1).padStart(2, '0');
            const day = String(hsd.getDate()).padStart(2, '0');
            hsd = `${day}/${month}/${year}`;
        }
        // Nếu là string, giữ nguyên
        else if (typeof hsd === 'string') {
            hsd = hsd.trim();
        }
    }

    
    const dvt = idxDvt >= 0 ? String(row[idxDvt] || '').trim() : '';
    const sl  = idxSl >= 0 ? Number(row[idxSl]) || 0 : 0;
    if (isExpired(hsd)) continue;
    if (sl <= 0) continue;
    items.push({ ma, lo, hsdRaw: hsd, dvt, sl, lotKey: normLot(lo) });
}

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
                if (!alreadyWarned) duplicateHsd.push({ ma: item.ma, lo: item.lo, hsd1, hsd2 });
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
    { key: 'chenh',   label: 'Chênh lệch',   color: '#c0392b', bgColor: '#fff5f5' },
    { key: 'khop',    label: 'Khớp',          color: '#27ae60', bgColor: '#f0fff4' },
    { key: 'hsdlech', label: 'Lệch HSD',      color: '#8e44ad', bgColor: '#f9f0ff' },
    { key: 'webkho',  label: 'Chỉ WebKho',    color: '#d68910', bgColor: '#fffde7' },
    { key: 'misa',    label: 'Chỉ Misa',       color: '#ca6f1e', bgColor: '#fff3e0' },
    { key: 'nomisa',  label: 'Misa thiếu mã', color: '#922b21', bgColor: '#fdecea' },
];

// ============================================================
// LOT HISTORY MODAL — FIX 2 & 3: bổ sung inventory_adjustments
// ============================================================
const LotHistoryModal = ({ productId, lotNumber, onClose }) => {
    const [history, setHistory] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const results = [];
                const pidTrim = productId.trim();
                const normLotNum = normLot(lotNumber || '');

                // Helper: safe fetch với permission fallback
                const safeFetch = async (collName, constraints) => {
                    try {
                        return await getDocs(query(collection(db, collName), ...constraints));
                    } catch (err) {
                        if (err.code === 'permission-denied') {
                            toast.warn(`⚠️ Chưa có quyền đọc ${collName} — kiểm tra Firestore Rules.`, { autoClose: 5000 });
                            return { forEach: () => {} };
                        }
                        throw err;
                    }
                };

                // ── Import tickets ──
                const importSnap = await safeFetch('import_tickets', [where('productIds', 'array-contains', pidTrim)]);
                importSnap.forEach(doc => {
                    const d = doc.data();
                    (d.items || [])
                        .filter(item => String(item.productId || '').trim() === pidTrim && normLot(item.lotNumber) === normLotNum)
                        .forEach(item => results.push({
                            type: 'import',
                            date: d.importDate || '',
                            dateRaw: null,
                            quantity: item.quantity || 0,
                            unit: item.unit || '',
                            expiryDate: item.expiryDate || '',
                            partner: d.supplierName || d.supplierId || '',
                            description: d.description || '',
                        }));
                });

                // ── Export tickets ──
                const exportSnap = await safeFetch('export_tickets', [where('productIds', 'array-contains', pidTrim)]);
                
                exportSnap.forEach(doc => {
                    const d = doc.data();
                    const matchingItems = (d.items || [])
                        .filter(item => String(item.productId || '').trim() === pidTrim && normLot(item.lotNumber) === normLotNum);
                    
                    if (matchingItems.length > 0) {
                        matchingItems.forEach((item, idx) => {
                            
                            results.push({
                                type: 'export',
                                date: d.exportDate || '',
                                dateRaw: null,
                                quantity: item.quantityToExport || 0,
                                unit: item.unit || '',
                                expiryDate: item.expiryDate || '',
                                partner: d.customer || d.customerId || '',
                                description: d.description || '',
                            });
                        });
                    }
                });

                // ── FIX 2: Inventory adjustments ──
                // Fields: productId, lotNumber, variance, quantityBefore, quantityAfter, reason, createdAt
                const adjSnap = await safeFetch('inventory_adjustments', [where('productId', '==', pidTrim)]);
                adjSnap.forEach(doc => {
                    const d = doc.data();
                    if (normLot(d.lotNumber) !== normLotNum) return;
                    const createdAt = d.createdAt?.toDate?.() || null;
                    results.push({
                        type: 'adjust',
                        date: createdAt ? fmtDateDisplay(createdAt) : '',
                        dateRaw: createdAt,
                        quantity: d.variance || 0,
                        quantityBefore: d.quantityBefore,
                        quantityAfter: d.quantityAfter,
                        unit: '',
                        expiryDate: '',
                        partner: '',
                        description: d.reason || '',
                    });
                });

                // Sort by date desc
                results.sort((a, b) => {
                    const da = a.dateRaw || parseDate(a.date) || new Date(0);
                    const db2 = b.dateRaw || parseDate(b.date) || new Date(0);
                    return db2 - da;
                });

                setHistory(results);
            } catch (e) {
                console.error(e);
                toast.error('Lỗi tải lịch sử: ' + e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [productId, lotNumber]);

    const totalImport = history.filter(h => h.type === 'import').reduce((s, h) => s + h.quantity, 0);
    const totalExport = history.filter(h => h.type === 'export').reduce((s, h) => s + h.quantity, 0);
    // FIX 3: Tính cả điều chỉnh vào tồn lý thuyết
    const totalAdj    = history.filter(h => h.type === 'adjust').reduce((s, h) => s + (h.quantity || 0), 0);
    const unit = history.find(h => h.unit)?.unit || '';

    const typeConfig = {
        import: { bg: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7', label: '↓ Nhập' },
        export: { bg: '#fff3e0', color: '#e65100', border: '#ffcc80', label: '↑ Xuất' },
        adjust: { bg: '#e3f2fd', color: '#1565c0', border: '#90caf9', label: '⚖ Điều chỉnh' },
    };

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-color, #fff)', borderRadius: '14px', padding: '28px', width: '760px', maxWidth: '94vw', maxHeight: '82vh', overflowY: 'auto', boxShadow: '0 12px 48px rgba(0,0,0,0.22)' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <FiClock style={{ color: '#7c3aed', fontSize: '18px' }} />
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>Lịch sử Lot</h3>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <span style={{ fontWeight: '600', color: '#007bff' }}>{productId}</span>
                            {' · '}Lot <strong>{lotNumber}</strong>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
                </div>

                {/* Summary chips */}
                {!loading && history.length > 0 && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
                        <div style={{ padding: '8px 14px', borderRadius: '8px', background: '#e8f5e9', border: '1px solid #a5d6a7', fontSize: '13px', fontWeight: '600', color: '#2e7d32' }}>
                            ↓ Nhập: {fmtNum(totalImport)} {unit}
                        </div>
                        <div style={{ padding: '8px 14px', borderRadius: '8px', background: '#fff3e0', border: '1px solid #ffcc80', fontSize: '13px', fontWeight: '600', color: '#e65100' }}>
                            ↑ Xuất: {fmtNum(totalExport)} {unit}
                        </div>
                        {totalAdj !== 0 && (
                            <div style={{ padding: '8px 14px', borderRadius: '8px', background: '#e3f2fd', border: '1px solid #90caf9', fontSize: '13px', fontWeight: '600', color: '#1565c0' }}>
                                ⚖ Điều chỉnh: {totalAdj > 0 ? '+' : ''}{fmtNum(totalAdj)} {unit}
                            </div>
                        )}
                        {/* FIX 3: Tồn lý thuyết = Nhập - Xuất + Điều chỉnh */}
                        <div style={{ padding: '8px 14px', borderRadius: '8px', background: '#f3e8ff', border: '1px solid #a855f7', fontSize: '13px', fontWeight: '600', color: '#6d28d9' }}>
                            = Tồn lý thuyết: {fmtNum(totalImport - totalExport + totalAdj)} {unit}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                        Đang tải lịch sử...
                    </div>
                ) : history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>📭</div>
                        Không tìm thấy lịch sử nhập/xuất cho lot này.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--table-header-bg, #f8f9fa)' }}>
                                    {['Loại', 'Ngày', 'Số lượng', 'Tồn trước→sau', 'HSD', 'Đối tác / Lý do'].map(h => (
                                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: 'var(--text-color)', borderBottom: '2px solid var(--border-color, #e0e0e0)', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((h, i) => {
                                    const cfg = typeConfig[h.type];
                                    const qtySign = h.type === 'import' ? '+' : h.type === 'export' ? '-' : (h.quantity >= 0 ? '+' : '');
                                    return (
                                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'var(--card-bg)' : 'var(--table-stripe-bg, #fafafa)', borderBottom: '1px solid var(--border-color, #eee)' }}>
                                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                                                    {cfg.label}
                                                </span>
                                            </td>
                                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontWeight: '500' }}>{fmtDateDisplay(h.date) || '—'}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '700', whiteSpace: 'nowrap', color: cfg.color }}>
                                                {qtySign}{fmtNum(Math.abs(h.quantity))} {h.unit}
                                            </td>
                                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                {h.type === 'adjust' && h.quantityBefore != null
                                                    ? `${fmtNum(h.quantityBefore)} → ${fmtNum(h.quantityAfter)}`
                                                    : '—'}
                                            </td>
                                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtDateDisplay(h.expiryDate) || '—'}</td>
                                            <td style={{ padding: '9px 12px', maxWidth: '220px' }}>
                                                <span title={h.partner || h.description} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {h.partner || h.description || '—'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================
// COMPONENT CHÍNH
// ============================================================
const InventoryReconciliationPage = () => {
    const [stockModal,      setStockModal]      = useState({ isOpen: false, productId: '', data: [], loading: false });
    const [lotHistoryModal, setLotHistoryModal] = useState({ isOpen: false, productId: '', lotNumber: '' });
    const [webkhoDuplicateHsd, setWebkhoDuplicateHsd] = React.useState([]);

    // CẢI TIẾN 1: Sort state
    const [sortState, setSortState] = React.useState({ col: null, dir: 'asc' });
    const handleSort = (col) => setSortState(prev =>
        prev.col === col
            ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
            : { col, dir: 'asc' }
    );

    const openStockModal = async (productId) => {
        setStockModal({ isOpen: true, productId, data: [], loading: true });
        try {
            const q = query(
                collection(db, 'inventory_lots'),
                where('productId', '==', productId.trim().toUpperCase()),
                where('quantityRemaining', '>', 0)
            );
            const snap = await getDocs(q);
            const rawLots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const lotMap = new Map();
            for (const lot of rawLots) {
                const lotNumber = (lot.lotNumber || '').trim();
                const expiry = lot.expiryDate?.toDate?.() || null;
                const key = `${lotNumber}__${expiry ? `${expiry.getFullYear()}-${expiry.getMonth()}-${expiry.getDate()}` : 'no-date'}`;
                if (lotMap.has(key)) {
                    const e = lotMap.get(key);
                    e.quantityRemaining += lot.quantityRemaining || 0;
                    e.quantityAllocated += lot.quantityAllocated || 0;
                } else {
                    lotMap.set(key, { ...lot, quantityRemaining: lot.quantityRemaining || 0, quantityAllocated: lot.quantityAllocated || 0 });
                }
            }
            const mergedLots = Array.from(lotMap.values());
            mergedLots.sort((a, b) => {
                const da = a.expiryDate?.toDate?.() || new Date(9999, 0, 1);
                const db2 = b.expiryDate?.toDate?.() || new Date(9999, 0, 1);
                return da - db2;
            });
            setStockModal({ isOpen: true, productId, data: mergedLots, loading: false });
        } catch (e) {
            setStockModal({ isOpen: true, productId, data: [], loading: false });
        }
    };

    const closeStockModal = () => setStockModal({ isOpen: false, productId: '', data: [], loading: false });
    const openLotHistory  = (productId, lotNumber) => setLotHistoryModal({ isOpen: true, productId, lotNumber });
    const closeLotHistory = () => setLotHistoryModal({ isOpen: false, productId: '', lotNumber: '' });

    // ── Store ──
    const {
        webkhoLots, convMap, altCodeMap, missingMisaCodes, lastUpdated,
        misaItems, misaFileName, duplicateHsdWarnings,
        activeTab,
        setWebkhoData, setMisaData, setActiveTab, reset,
    } = useReconciliationStore();

    const missingMisaCodesSet = useMemo(() => new Set(missingMisaCodes), [missingMisaCodes]);
    const [isLoadingWebkho, setIsLoadingWebkho] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const fileInputRef = useRef(null);

    // ============================================================
    // LOAD DỮ LIỆU TỪ FIRESTORE
    // ============================================================
    const loadWebkhoData = async () => {
        setIsLoadingWebkho(true);
        toast.info('Đang tải dữ liệu WebKho...');
        try {
            const lotsSnap = await getDocs(collection(db, 'inventory_lots'));
            const rawLots = [];
            lotsSnap.forEach(doc => {
                const d = doc.data();
                if (!d.productId) return;
                rawLots.push({
                    productId: d.productId,
                    lotNumber: d.lotNumber || '',
                    expiryDate: d.expiryDate ? (() => {
    const firebaseDate = d.expiryDate.toDate ? d.expiryDate.toDate() : d.expiryDate;
    // Lấy ngày theo local timezone (UTC+7)
    const year = firebaseDate.getFullYear();
    const month = firebaseDate.getMonth();
    const day = firebaseDate.getDate();
    return new Date(year, month, day);
})() : null,
                    quantityRemaining: d.quantityRemaining || 0,
                    unit: d.unit || '',
                });
            });

            const lotMap = new Map();
            const lotHsdMap = new Map();
            const newWebkhoDups = [];

            for (const lot of rawLots) {
                if (isExpired(lot.expiryDate)) continue;
                if (lot.quantityRemaining <= 0) continue;
                const lotKey = normLot(lot.lotNumber);
                const key = `${lot.productId}__${lot.lotNumber}`;
                const hsdStr = fmtDateDisplay(lot.expiryDate);
                const hsdTrackKey = `${lot.productId}__${lotKey}`;
                if (!lotHsdMap.has(hsdTrackKey)) lotHsdMap.set(hsdTrackKey, { hsds: new Set(), lots: [] });
                const tracker = lotHsdMap.get(hsdTrackKey);
                if (hsdStr) tracker.hsds.add(hsdStr);
                tracker.lots.push({ lotNumber: lot.lotNumber, hsd: hsdStr, qty: lot.quantityRemaining });
                if (lotMap.has(key)) lotMap.get(key).quantityRemaining += lot.quantityRemaining;
                else lotMap.set(key, { ...lot, lotKey });
            }

            for (const [hsdTrackKey, tracker] of lotHsdMap) {
                if (tracker.hsds.size > 1) {
                    const [productId, lotKey] = hsdTrackKey.split('__');
                    const hsdList = [...tracker.hsds];
                    if (!newWebkhoDups.some(d => d.productId === productId && normLot(d.lotNumber) === lotKey)) {
                        newWebkhoDups.push({ productId, lotNumber: tracker.lots[0].lotNumber, hsd1: hsdList[0], hsd2: hsdList[1], totalQty: tracker.lots.reduce((s, l) => s + l.qty, 0), count: tracker.lots.length });
                    }
                }
            }

            setWebkhoDuplicateHsd(newWebkhoDups);
            if (newWebkhoDups.length > 0) toast.warn(`⚠️ WebKho có ${newWebkhoDups.length} lot cùng số lô nhưng khác HSD!`);

            const finalLots = [...lotMap.values()];
            const prodsSnap = await getDocs(collection(db, 'products'));
            const newConvMap = {}, newAltMap = {}, newMissingSet = new Set();
            prodsSnap.forEach(doc => {
                const d = doc.data(), id = doc.id;
                if (d.misaConversionFactor != null) newConvMap[id] = Number(d.misaConversionFactor) || 1;
                if (d.misaCode && d.misaCode !== id) newAltMap[id] = d.misaCode;
                if (d.missingFromMisa === true) newMissingSet.add(id);
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
            const { items, duplicateHsd } = await parseMisaExcel(buf);
            setMisaData(items, file.name, duplicateHsd);
            if (duplicateHsd.length > 0) toast.warn(`⚠️ Có ${duplicateHsd.length} lot trong Misa bị trùng số lô nhưng khác HSD!`);
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
        if (!webkhoLots.length && !misaItems.length) return { results: [], counts: {} };

        const misaLookup = new Map();
        for (const item of misaItems) misaLookup.set(`${item.ma}__${item.lotKey}`, item);

        const results = [];
        const matchedMisaKeys = new Set();

        for (const lot of webkhoLots) {
            const misaCode = altCodeMap[lot.productId] || lot.productId;
            const heySo = convMap[lot.productId] ?? 1;
            const qtyWebkhoQd = lot.quantityRemaining * heySo;
            const misaKey = `${misaCode}__${lot.lotKey}`;
            const misaItem = misaLookup.get(misaKey);
            let status, nhom, chenhWebkho, chenhMisa, dvtMisa, tonMisa, hsdMisa, hsdLech;

            if (misaItem) {
                matchedMisaKeys.add(misaKey);
                dvtMisa = misaItem.dvt; tonMisa = misaItem.sl;
                hsdMisa = fmtDateDisplay(misaItem.hsdRaw);
                const hsdWebkho = fmtDateDisplay(lot.expiryDate);
                hsdLech = hsdWebkho && hsdMisa && hsdWebkho !== hsdMisa;
                const diff = qtyWebkhoQd - tonMisa;
                chenhWebkho = diff / heySo;
                chenhMisa = heySo !== 1 ? diff : null;
                
                if (hsdLech) { nhom = 'hsdlech'; status = '🟣 Lệch HSD'; }
                else if (Math.abs(diff) < 0.001) { nhom = 'khop'; status = '✅ Khớp'; }
                else if (diff > 0) { nhom = 'chenh'; status = '⬆️ WebKho cao hơn'; }
                else { nhom = 'chenh'; status = '⬇️ WebKho thấp hơn'; }
            } else {
                dvtMisa = ''; tonMisa = null; hsdMisa = '';
                chenhWebkho = null; chenhMisa = null; hsdLech = false;
                if (missingMisaCodesSet.has(lot.productId)) { nhom = 'nomisa'; status = '🔴 Misa chưa có mã'; }
                else { nhom = 'webkho'; status = '🟡 Chỉ có trên WebKho'; }
            }

            results.push({
                nhom, productId: lot.productId, lotNumber: lot.lotNumber,
                hsdWebkho: fmtDateDisplay(lot.expiryDate),
                expiryDateRaw: lot.expiryDate,   // giữ raw để tính badge
                dvtWebkho: lot.unit,
                tonWebkho: lot.quantityRemaining, heySo, tonWebkhoQd: qtyWebkhoQd,
                dvtMisa, tonMisa, hsdMisa, hsdLech: !!hsdLech, chenhWebkho, chenhMisa, status,
            });
        }

        for (const item of misaItems) {
            if (!matchedMisaKeys.has(`${item.ma}__${item.lotKey}`)) {
                results.push({
                    nhom: 'misa', productId: item.ma, lotNumber: item.lo,
                    hsdWebkho: '', expiryDateRaw: null, dvtWebkho: '', tonWebkho: null, heySo: null, tonWebkhoQd: null,
                    dvtMisa: item.dvt, tonMisa: item.sl, hsdMisa: fmtDateDisplay(item.hsdRaw),
                    hsdLech: false, chenhWebkho: null, chenhMisa: null, status: '🟠 Chỉ có trên Misa',
                });
            }
        }

        const counts = {};
        for (const r of results) counts[r.nhom] = (counts[r.nhom] || 0) + 1;
        results.sort((a, b) => {
            if (a.nhom !== b.nhom) return 0;
            if (a.nhom === 'chenh') return Math.abs(b.chenhWebkho || 0) - Math.abs(a.chenhWebkho || 0);
            return 0;
        });

        return { results, counts };
    }, [webkhoLots, misaItems, convMap, altCodeMap, missingMisaCodes]);

    // ============================================================
    // CẢI TIẾN 1: LỌC + SORT THEO TAB + SEARCH
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
        if (sortState.col) {
            rows = [...rows].sort((a, b) => {
                let va, vb;
                switch (sortState.col) {
                    case 'productId': va = a.productId; vb = b.productId; break;
                    case 'lotNumber': va = a.lotNumber || ''; vb = b.lotNumber || ''; break;
                    case 'hsdWebkho': va = parseDate(a.hsdWebkho) || new Date(0); vb = parseDate(b.hsdWebkho) || new Date(0); break;
                    case 'tonWebkho': va = a.tonWebkho ?? -Infinity; vb = b.tonWebkho ?? -Infinity; break;
                    case 'tonMisa':   va = a.tonMisa   ?? -Infinity; vb = b.tonMisa   ?? -Infinity; break;
                    case 'chenh':     va = Math.abs(a.chenhWebkho ?? 0); vb = Math.abs(b.chenhWebkho ?? 0); break;
                    default: return 0;
                }
                if (va instanceof Date) return sortState.dir === 'asc' ? va - vb : vb - va;
                if (typeof va === 'number') return sortState.dir === 'asc' ? va - vb : vb - va;
                return sortState.dir === 'asc'
                    ? String(va).localeCompare(String(vb))
                    : String(vb).localeCompare(String(va));
            });
        }
        return rows;
    }, [results, activeTab, search, sortState]);

    // ============================================================
    // XUẤT EXCEL
    // ============================================================
    const handleExport = async () => {
        if (!results.length) { toast.warn('Chưa có dữ liệu để xuất.'); return; }
        const XLSX = await loadXLSX();
        const wb = XLSX.utils.book_new();
        const COLS = ['Mã hàng','Số lot','HSD WebKho','ĐVT WebKho','Tồn WebKho','Hệ số','Tồn WebKho (quy đổi)','ĐVT Misa','Tồn Misa','HSD Misa','Chênh (ĐVT WebKho)','Chênh (ĐVT Misa)','Trạng thái'];
        const tabOrder = ['chenh','khop','hsdlech','webkho','misa','nomisa'];
        const tabLabel = { chenh:'Chênh lệch', khop:'Khớp', hsdlech:'Lệch HSD', webkho:'Chỉ WebKho', misa:'Chỉ Misa', nomisa:'Misa thiếu mã' };
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
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), tabLabel[tab]);
        }
        const now = new Date();
        const stamp = `${now.getDate().toString().padStart(2,'0')}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getFullYear()}`;
        XLSX.writeFile(wb, `doi_chieu_ton_kho_${stamp}.xlsx`);
        toast.success('Đã xuất file Excel!');
    };

    // ============================================================
    // RENDER HELPERS
    // ============================================================
    const hasData = webkhoLots.length > 0 || misaItems.length > 0;
    const canReconcile = webkhoLots.length > 0 && misaItems.length > 0;

    // CẢI TIẾN 1: Sort arrow indicator
    const SortArrow = ({ col }) => sortState.col !== col
        ? <span style={{ color: '#bbb', marginLeft: '2px', fontSize: '10px' }}>↕</span>
        : <span style={{ color: '#007bff', marginLeft: '2px', fontSize: '10px' }}>{sortState.dir === 'asc' ? '↑' : '↓'}</span>;

    // Sortable TH
    const SortTh = ({ col, label, align = 'left' }) => (
        <th onClick={() => handleSort(col)} style={{
            padding: '8px 6px', textAlign: align, fontWeight: '600', fontSize: '11px',
            color: 'var(--text-color)', borderBottom: '2px solid var(--border-color)',
            whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
            backgroundColor: sortState.col === col ? 'var(--table-header-active-bg, #eef2ff)' : 'var(--table-header-bg)',
        }}>
            {label}<SortArrow col={col} />
        </th>
    );

    // Plain TH (không sort)
    const PlainTh = ({ label, align = 'left' }) => (
        <th style={{ padding: '8px 6px', textAlign: align, fontWeight: '600', fontSize: '11px', color: 'var(--text-color)', borderBottom: '2px solid var(--border-color)', whiteSpace: 'nowrap', backgroundColor: 'var(--table-header-bg)' }}>
            {label}
        </th>
    );

    // Banner HSD trùng
    const DuplicateHsdWarning = ({ warnings, source }) => {
        if (!warnings.length) return null;
        const isMisa = source === 'misa';
        return (
            <div style={{ backgroundColor: isMisa ? '#fff8e1' : '#fce4ec', border: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}`, borderLeft: `4px solid ${isMisa ? '#f9a825' : '#e91e63'}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: '600', color: isMisa ? '#e65100' : '#c2185b', marginBottom: '8px', fontSize: '14px' }}>
                    ⚠️ {isMisa ? 'Misa' : 'WebKho'}: Phát hiện {warnings.length} lot cùng số lô nhưng khác HSD
                    {!isMisa && ' — Dữ liệu nhập kho có thể bị lỗi, cần kiểm tra lại!'}
                    {isMisa && ' — cần kiểm tra lại trên Misa!'}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead><tr style={{ backgroundColor: isMisa ? '#fff3cd' : '#fce4ec' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}` }}>Mã hàng</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}` }}>Số lô</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}` }}>HSD 1</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}` }}>HSD 2</th>
                        {!isMisa && <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e91e63' }}>Docs</th>}
                        {!isMisa && <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e91e63' }}>Tổng tồn</th>}
                    </tr></thead>
                    <tbody>{warnings.map((w, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? (isMisa ? '#fffde7' : '#fce4ec') : (isMisa ? '#fff8e1' : '#f8bbd0') }}>
                            <td style={{ padding: '5px 10px', fontWeight: '600', color: '#333' }}>{isMisa ? w.ma : w.productId}</td>
                            <td style={{ padding: '5px 10px', color: '#555' }}>{isMisa ? w.lo : w.lotNumber}</td>
                            <td style={{ padding: '5px 10px', color: '#c0392b' }}>{w.hsd1}</td>
                            <td style={{ padding: '5px 10px', color: '#c0392b' }}>{w.hsd2}</td>
                            {!isMisa && <td style={{ padding: '5px 10px', textAlign: 'right', color: '#555' }}>{w.count} docs</td>}
                            {!isMisa && <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '600' }}>{fmtNum(w.totalQty)}</td>}
                        </tr>
                    ))}</tbody>
                </table>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#795548' }}>
                    {isMisa ? '💡 Số lượng đã cộng dồn — sửa HSD đúng trên Misa rồi xuất file mới.' : '💡 Đã cộng dồn số lượng — kiểm tra phiếu nhập để sửa HSD.'}
                </div>
            </div>
        );
    };

    // Banner lệch HSD WebKho vs Misa
    const HsdMismatchBanner = ({ rows }) => {
        const mm = rows.filter(r => r.nhom === 'hsdlech');
        if (!mm.length) return null;
        return (
            <div style={{ backgroundColor: '#f3e8ff', border: '1px solid #a855f7', borderLeft: '4px solid #7c3aed', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: '600', color: '#6d28d9', marginBottom: '8px', fontSize: '14px' }}>
                    🟣 Phát hiện {mm.length} lot khớp số lô nhưng HSD ghi khác nhau giữa WebKho và Misa
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead><tr style={{ backgroundColor: '#ede9fe' }}>
                        {['Mã hàng','Số lô','HSD WebKho','HSD Misa','Chênh lệch SL'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #a855f7', color: '#5b21b6' }}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>{mm.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#f5f3ff' : '#ede9fe' }}>
                            <td style={{ padding: '5px 10px', fontWeight: '600', color: '#333' }}>
                                <button onClick={() => { setActiveTab('hsdlech'); setSearch(r.productId); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', textDecoration: 'underline', fontWeight: '600', padding: 0, fontSize: 'inherit' }}>{r.productId}</button>
                            </td>
                            <td style={{ padding: '5px 10px', color: '#555' }}>{r.lotNumber}</td>
                            <td style={{ padding: '5px 10px', color: '#c0392b', fontWeight: '500' }}>{r.hsdWebkho || '—'}</td>
                            <td style={{ padding: '5px 10px', color: '#c0392b', fontWeight: '500' }}>{r.hsdMisa || '—'}</td>
                            <td style={{ padding: '5px 10px', fontWeight: '600', color: r.chenhWebkho && Math.abs(r.chenhWebkho) >= 0.001 ? (r.chenhWebkho > 0 ? '#e67e22' : '#e74c3c') : '#27ae60' }}>
                                {r.chenhWebkho != null && Math.abs(r.chenhWebkho) >= 0.001 ? fmtChenh(r.chenhWebkho, r.dvtWebkho) : '✅ Khớp SL'}
                            </td>
                        </tr>
                    ))}</tbody>
                </table>
                {mm.length > 10 && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#6d28d9' }}>
                        ... và {mm.length - 10} lot khác.
                        <button onClick={() => setActiveTab('hsdlech')} style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', textDecoration: 'underline', fontSize: '12px' }}>Xem tất cả →</button>
                    </div>
                )}
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#6d28d9' }}>
                    💡 Không kết luận bên nào đúng — kiểm tra phiếu nhập gốc. Bấm tab <strong>Lệch HSD</strong> để xem đầy đủ.
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: '20px' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '600' }}>Đối chiếu tồn kho WebKho vs Misa</h1>
                    {lastUpdated && (
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {(() => { const d = new Date(lastUpdated); return `Dữ liệu WebKho: ${fmtDateDisplay(d)} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`; })()}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={loadWebkhoData} disabled={isLoadingWebkho} className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                        <FiRefreshCw style={{ fontSize: '14px', animation: isLoadingWebkho ? 'spin 1s linear infinite' : 'none' }} />
                        {isLoadingWebkho ? 'Đang tải...' : webkhoLots.length ? 'Cập nhật WebKho' : 'Tải dữ liệu WebKho'}
                    </button>

                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleMisaUpload} style={{ display: 'none' }} id="misa-upload" />
                    <label htmlFor="misa-upload" className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer', padding: '10px 15px', borderRadius: '5px' }}>
                        <FiUpload style={{ fontSize: '14px' }} />
                        {misaFileName ? `Misa: ${misaFileName.length > 20 ? misaFileName.substring(0,20)+'...' : misaFileName}` : 'Upload file Misa'}
                    </label>

                    {canReconcile && (
                        <button onClick={handleExport} className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', backgroundColor: '#2c7a4e', color: 'white', border: 'none' }}>
                            <FiDownload style={{ fontSize: '14px' }} />
                            Xuất Excel
                        </button>
                    )}

                    {hasData && (
                        <button onClick={() => { if (window.confirm('Xóa toàn bộ dữ liệu đối chiếu hiện tại?')) { reset(); setWebkhoDuplicateHsd([]); setSortState({ col: null, dir: 'asc' }); } }}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', backgroundColor: '#e74c3c', color: 'white', border: 'none' }}>
                            <FiAlertCircle style={{ fontSize: '14px' }} />
                            Hủy đối chiếu
                        </button>
                    )}
                </div>
            </div>

            {/* BANNERS CẢNH BÁO */}
            <DuplicateHsdWarning warnings={webkhoDuplicateHsd} source="webkho" />
            <DuplicateHsdWarning warnings={duplicateHsdWarnings} source="misa" />
            {canReconcile && <HsdMismatchBanner rows={results} />}

            {/* HƯỚNG DẪN */}
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

            {canReconcile && (<>
                {/* CẢI TIẾN 2: STICKY SUMMARY BAR */}
                <div style={{
                    position: 'sticky', top: 0, zIndex: 10,
                    backgroundColor: 'var(--bg-color, #f8f9fa)',
                    borderBottom: '1px solid var(--border-color)',
                    paddingTop: '8px', paddingBottom: '10px',
                }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {TABS.map(tab => (
                            <div key={tab.key} onClick={() => { setActiveTab(tab.key); setSortState({ col: null, dir: 'asc' }); }} style={{
                                padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                                border: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                                backgroundColor: activeTab === tab.key ? tab.bgColor : 'var(--card-bg)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)', minWidth: '88px', transition: 'all 0.15s',
                            }}>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: tab.color }}>{counts[tab.key] || 0}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{tab.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* SEARCH */}
                <div style={{ margin: '10px 0' }}>
                    <input type="text" placeholder="Tìm theo mã hàng hoặc số lot..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '14px', width: '280px', maxWidth: '100%' }}
                    />
                    <span style={{ marginLeft: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {filtered.length} kết quả
                        {sortState.col && (
                            <span style={{ marginLeft: '8px', color: '#007bff', fontSize: '12px' }}>
                                • Sort: {sortState.col} {sortState.dir === 'asc' ? '↑' : '↓'}
                                <button onClick={() => setSortState({ col: null, dir: 'asc' })} style={{ marginLeft: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '11px' }}>✕</button>
                            </span>
                        )}
                    </span>
                </div>

                {/* BẢNG KẾT QUẢ */}
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '90px' }} />  {/* Mã hàng */}
                            <col style={{ width: '80px' }} />  {/* Số lot */}
                            <col style={{ width: '82px' }} />  {/* HSD WK + badge */}
                            <col style={{ width: '46px' }} />  {/* ĐVT WK */}
                            <col style={{ width: '66px' }} />  {/* Tồn WK */}
                            <col style={{ width: '32px' }} />  {/* × */}
                            <col style={{ width: '64px' }} />  {/* Tồn QĐ */}
                            <col style={{ width: '46px' }} />  {/* ĐVT Misa */}
                            <col style={{ width: '66px' }} />  {/* Tồn Misa */}
                            <col style={{ width: '76px' }} />  {/* HSD Misa */}
                            <col style={{ width: '90px' }} />  {/* Chênh */}
                            <col style={{ width: '110px' }} /> {/* Trạng thái */}
                            <col style={{ width: '54px' }} />  {/* Lịch sử */}
                        </colgroup>
                        <thead>
                            {/* Header sticky ngay dưới summary bar */}
                            <tr style={{ position: 'sticky', top: '62px', zIndex: 1 }}>
                                <SortTh col="productId" label="Mã hàng" />
                                <SortTh col="lotNumber" label="Số lot" />
                                <SortTh col="hsdWebkho" label="HSD WK" align="center" />
                                <PlainTh label="ĐVT WK" align="center" />
                                <SortTh col="tonWebkho" label="Tồn WK" align="right" />
                                <PlainTh label="×" align="center" />
                                <PlainTh label="Tồn QĐ" align="right" />
                                <PlainTh label="ĐVT Misa" align="center" />
                                <SortTh col="tonMisa" label="Tồn Misa" align="right" />
                                <PlainTh label="HSD Misa" align="center" />
                                <SortTh col="chenh" label="Chênh" align="right" />
                                <PlainTh label="Trạng thái" />
                                <PlainTh label="" align="center" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={13} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Không có dữ liệu</td></tr>
                            ) : filtered.map((r, i) => {
                                const rowBg = i % 2 === 0 ? 'var(--card-bg)' : 'var(--table-stripe-bg)';
                                const chenhColor = r.chenhWebkho > 0 ? '#e67e22' : r.chenhWebkho < 0 ? '#e74c3c' : 'inherit';
                                const hasDupHsd = webkhoDuplicateHsd.some(d => d.productId === r.productId && normLot(d.lotNumber) === normLot(r.lotNumber));
                                const isHsdLech = r.nhom === 'hsdlech';
                                const chenhDisplay = r.chenhWebkho != null ? fmtChenh(r.chenhWebkho, r.dvtWebkho) : '';
                                const chenhTitle = (r.chenhMisa != null && r.heySo !== 1) ? `Theo ĐVT Misa: ${fmtChenh(r.chenhMisa, r.dvtMisa)}` : '';
                                // CẢI TIẾN 3: Badge HSD sắp hết hạn
                                const expiryBadge = getExpiryBadge(r.expiryDateRaw || r.hsdWebkho);

                                return (
                                    <tr key={i} style={{
                                        backgroundColor: hasDupHsd ? '#fce4ec' : isHsdLech ? '#f5f3ff' : rowBg,
                                        outline: hasDupHsd ? '1px solid #e91e63' : isHsdLech ? '1px solid #a855f7' : 'none',
                                    }}>
                                        {/* Mã hàng */}
                                        <td style={tdCompact}>
                                            <button onClick={() => openStockModal(r.productId)} title={r.productId + (hasDupHsd ? ' ⚠ Trùng HSD' : '')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: hasDupHsd ? '#c2185b' : isHsdLech ? '#7c3aed' : '#007bff', textDecoration: 'underline', fontWeight: '600', fontSize: 'inherit', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', display: 'block' }}>
                                                {r.productId}{hasDupHsd ? '⚠' : ''}
                                            </button>
                                        </td>
                                        {/* Số lot */}
                                        <td style={{ ...tdCompact, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.lotNumber}>{r.lotNumber}</td>
                                        {/* HSD WK + badge */}
                                        <td style={{ ...tdCompact, textAlign: 'center', color: isHsdLech ? '#7c3aed' : 'var(--text-color)', fontWeight: isHsdLech ? '600' : 'normal' }}>
                                            {r.hsdWebkho}
                                            {expiryBadge && (
                                                <span title={`Còn ${expiryBadge.label} ngày đến HSD`} style={{ display: 'inline-block', marginLeft: '3px', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: expiryBadge.bg, color: expiryBadge.color, border: `1px solid ${expiryBadge.border}`, verticalAlign: 'middle', cursor: 'help' }}>
                                                    {expiryBadge.label}
                                                </span>
                                            )}
                                        </td>
                                        {/* ĐVT WK */}
                                        <td style={{ ...tdCompact, textAlign: 'center', color: 'var(--text-secondary)' }}>{r.dvtWebkho}</td>
                                        {/* Tồn WK */}
                                        <td style={{ ...tdCompact, textAlign: 'right' }}>{r.tonWebkho != null ? fmtNum(r.tonWebkho) : ''}</td>
                                        {/* Hệ số */}
                                        <td style={{ ...tdCompact, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px' }}>{r.heySo != null && r.heySo !== 1 ? r.heySo : ''}</td>
                                        {/* Tồn QĐ */}
                                        <td style={{ ...tdCompact, textAlign: 'right', color: 'var(--text-secondary)' }}>{r.heySo != null && r.heySo !== 1 && r.tonWebkhoQd != null ? fmtNum(r.tonWebkhoQd) : ''}</td>
                                        {/* ĐVT Misa */}
                                        <td style={{ ...tdCompact, textAlign: 'center', color: 'var(--text-secondary)' }}>{r.dvtMisa}</td>
                                        {/* Tồn Misa */}
                                        <td style={{ ...tdCompact, textAlign: 'right' }}>{r.tonMisa != null ? fmtNum(r.tonMisa) : ''}</td>
                                        {/* HSD Misa */}
                                        <td style={{ ...tdCompact, textAlign: 'center', color: isHsdLech ? '#7c3aed' : 'var(--text-color)', fontWeight: isHsdLech ? '600' : 'normal' }}>{r.hsdMisa}</td>
                                        {/* Chênh */}
                                        <td style={{ ...tdCompact, textAlign: 'right', fontWeight: '600', color: chenhColor }} title={chenhTitle}>
                                            {chenhDisplay}
                                            {chenhTitle && <span style={{ fontSize: '10px', color: '#bbb', marginLeft: '2px' }}>*</span>}
                                        </td>
                                        {/* Trạng thái */}
                                        <td style={{ ...tdCompact, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.status}>{r.status}</td>
                                        {/* Lịch sử */}
                                        <td style={{ ...tdCompact, textAlign: 'center', padding: '4px' }}>
                                            {r.lotNumber ? (
                                                <button onClick={() => openLotHistory(r.productId, r.lotNumber)} title={`Lịch sử lot ${r.lotNumber}`}
                                                    style={{ background: '#f3e8ff', border: '1px solid #a855f7', borderRadius: '5px', cursor: 'pointer', padding: '3px 6px', color: '#7c3aed', fontSize: '11px', display: 'inline-flex', alignItems: 'center' }}>
                                                    <FiClock style={{ fontSize: '11px' }} />
                                                </button>
                                            ) : null}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </>)}

            {/* CHỈ CÓ 1 TRONG 2 */}
            {(webkhoLots.length > 0 && !misaItems.length) && (
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px', textAlign: 'center', marginTop: '12px' }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Đã tải <strong>{webkhoLots.length} lot</strong> từ WebKho. Hãy upload file Misa để bắt đầu đối chiếu.</p>
                </div>
            )}
            {(!webkhoLots.length && misaItems.length > 0) && (
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px', textAlign: 'center', marginTop: '12px' }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Đã đọc <strong>{misaItems.length} lot</strong> từ Misa. Hãy tải dữ liệu WebKho để bắt đầu đối chiếu.</p>
                </div>
            )}

            {/* MODAL TỒN KHO NHANH */}
            {stockModal.isOpen && (
                <div onClick={closeStockModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-color, #fff)', borderRadius: '12px', padding: '24px', width: '620px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0 }}>Tồn kho: {stockModal.productId}</h3>
                            <button onClick={closeStockModal} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                        </div>
                        {stockModal.loading ? (
                            <p style={{ textAlign: 'center', color: '#888' }}>Đang tải...</p>
                        ) : stockModal.data.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#888' }}>Không có tồn kho.</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                                        <th style={{ padding: '8px' }}>Số lô</th>
                                        <th style={{ padding: '8px' }}>HSD</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Tồn thực</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Đặt giữ</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Khả dụng</th>
                                        <th style={{ padding: '8px', textAlign: 'center' }}>Lịch sử</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockModal.data.map(lot => {
                                        const allocated = lot.quantityAllocated || 0;
                                        const available = lot.quantityRemaining - allocated;
                                        const badge = getExpiryBadge(lot.expiryDate);
                                        return (
                                            <tr key={lot.id} style={{ borderBottom: '1px solid #eee', backgroundColor: badge?.color === '#c0392b' ? '#fff5f5' : 'transparent' }}>
                                                <td style={{ padding: '8px' }}>{lot.lotNumber || '(Không có)'}</td>
                                                <td style={{ padding: '8px' }}>
                                                    {lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'}
                                                    {badge && <span style={{ marginLeft: '4px', padding: '1px 5px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>}
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{formatNumber(lot.quantityRemaining)}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', color: '#e67e22' }}>{allocated > 0 ? formatNumber(allocated) : '-'}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', color: 'green', fontWeight: 'bold' }}>{formatNumber(available)}</td>
                                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                                    {lot.lotNumber && (
                                                        <button onClick={() => { closeStockModal(); openLotHistory(stockModal.productId, lot.lotNumber); }}
                                                            style={{ background: 'none', border: '1px solid #7c3aed', borderRadius: '5px', cursor: 'pointer', padding: '3px 8px', color: '#7c3aed', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <FiClock style={{ fontSize: '11px' }} /> Lịch sử
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #ddd', fontWeight: 'bold' }}>
                                        <td colSpan={2} style={{ padding: '8px' }}>Tổng</td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatNumber(stockModal.data.reduce((s, l) => s + l.quantityRemaining, 0))}</td>
                                        <td style={{ padding: '8px', textAlign: 'right', color: '#e67e22' }}>{formatNumber(stockModal.data.reduce((s, l) => s + (l.quantityAllocated || 0), 0))}</td>
                                        <td style={{ padding: '8px', textAlign: 'right', color: 'green' }}>{formatNumber(stockModal.data.reduce((s, l) => s + (l.quantityRemaining - (l.quantityAllocated || 0)), 0))}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL LỊCH SỬ LOT */}
            {lotHistoryModal.isOpen && (
                <LotHistoryModal
                    productId={lotHistoryModal.productId}
                    lotNumber={lotHistoryModal.lotNumber}
                    onClose={closeLotHistory}
                />
            )}

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

const tdCompact = {
    padding: '7px 6px',
    borderBottom: '1px solid var(--border-color)',
    color: 'var(--text-color)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

export default InventoryReconciliationPage;