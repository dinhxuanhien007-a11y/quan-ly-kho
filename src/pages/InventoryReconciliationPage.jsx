// src/pages/InventoryReconciliationPage.jsx
import { useState } from 'react';
import React, { useMemo, useRef } from 'react';
import useReconciliationStore from '../stores/reconciliationStore';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { FiUpload, FiDownload, FiRefreshCw, FiAlertCircle, FiClock } from 'react-icons/fi';

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
        const hsd = idxHsd >= 0 ? row[idxHsd] : null;
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
    { key: 'chenh',   label: 'Chênh lệch',    color: '#c0392b', bgColor: '#fff5f5' },
    { key: 'khop',    label: 'Khớp',           color: '#27ae60', bgColor: '#f0fff4' },
    { key: 'hsdlech', label: 'Lệch HSD',       color: '#8e44ad', bgColor: '#f9f0ff' },
    { key: 'webkho',  label: 'Chỉ WebKho',     color: '#d68910', bgColor: '#fffde7' },
    { key: 'misa',    label: 'Chỉ Misa',        color: '#ca6f1e', bgColor: '#fff3e0' },
    { key: 'nomisa',  label: 'Misa thiếu mã',  color: '#922b21', bgColor: '#fdecea' },
];

// ============================================================
// LOT HISTORY MODAL
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

                // Import tickets
                let importSnap;
                try {
                    const importQ = query(
                        collection(db, 'import_tickets'),
                        where('productIds', 'array-contains', pidTrim)
                    );
                    importSnap = await getDocs(importQ);
                } catch (err) {
                    if (err.code === 'permission-denied') {
                        toast.warn('⚠️ Firestore rules chưa cho phép đọc import_tickets — xem hướng dẫn trong console.', { autoClose: 6000 });
                        console.warn(
                            '[LotHistory] Cần thêm rule cho import_tickets:\n' +
                            'match /import_tickets/{doc} { allow read: if request.auth != null; }'
                        );
                        importSnap = { forEach: () => {} };
                    } else throw err;
                }
                importSnap.forEach(doc => {
                    const d = doc.data();
                    const matchItems = (d.items || []).filter(item =>
                        String(item.productId || '').trim() === pidTrim &&
                        normLot(item.lotNumber) === normLotNum
                    );
                    matchItems.forEach(item => {
                        results.push({
                            type: 'import',
                            date: d.importDate || '',
                            quantity: item.quantity || 0,
                            unit: item.unit || '',
                            expiryDate: item.expiryDate || '',
                            partner: d.supplierName || d.supplierId || '',
                            ticketId: doc.id,
                            description: d.description || '',
                        });
                    });
                });

                // Export tickets
                let exportSnap;
                try {
                    const exportQ = query(
                        collection(db, 'export_tickets'),
                        where('productIds', 'array-contains', pidTrim)
                    );
                    exportSnap = await getDocs(exportQ);
                } catch (err) {
                    if (err.code === 'permission-denied') {
                        toast.warn('⚠️ Firestore rules chưa cho phép đọc export_tickets — xem hướng dẫn trong console.', { autoClose: 6000 });
                        console.warn(
                            '[LotHistory] Cần thêm rule cho export_tickets:\n' +
                            'match /export_tickets/{doc} { allow read: if request.auth != null; }'
                        );
                        exportSnap = { forEach: () => {} };
                    } else throw err;
                }
                exportSnap.forEach(doc => {
                    const d = doc.data();
                    const matchItems = (d.items || []).filter(item =>
                        String(item.productId || '').trim() === pidTrim &&
                        normLot(item.lotNumber) === normLotNum
                    );
                    matchItems.forEach(item => {
                        results.push({
                            type: 'export',
                            date: d.exportDate || '',
                            quantity: item.quantityToExport || 0,
                            unit: item.unit || '',
                            expiryDate: item.expiryDate || '',
                            partner: d.customer || d.customerId || '',
                            ticketId: doc.id,
                            description: d.description || '',
                        });
                    });
                });

                // Sort by date desc
                results.sort((a, b) => {
                    const da = parseDate(a.date) || new Date(0);
                    const db2 = parseDate(b.date) || new Date(0);
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
    const unit = history[0]?.unit || '';

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: 'var(--bg-color, #fff)', borderRadius: '14px',
                padding: '28px', width: '720px', maxWidth: '94vw',
                maxHeight: '82vh', overflowY: 'auto',
                boxShadow: '0 12px 48px rgba(0,0,0,0.22)'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <FiClock style={{ color: '#7c3aed', fontSize: '18px' }} />
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>Lịch sử Lot</h3>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <span style={{ fontWeight: '600', color: '#007bff' }}>{productId}</span>
                            {' · '}
                            <span>Lot <strong>{lotNumber}</strong></span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: '22px',
                        cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1
                    }}>✕</button>
                </div>

                {/* Summary chips */}
                {!loading && history.length > 0 && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
                        <div style={{
                            padding: '8px 16px', borderRadius: '8px',
                            background: '#e8f5e9', border: '1px solid #a5d6a7',
                            fontSize: '13px', fontWeight: '600', color: '#2e7d32'
                        }}>
                            ↓ Tổng nhập: {fmtNum(totalImport)} {unit}
                        </div>
                        <div style={{
                            padding: '8px 16px', borderRadius: '8px',
                            background: '#fff3e0', border: '1px solid #ffcc80',
                            fontSize: '13px', fontWeight: '600', color: '#e65100'
                        }}>
                            ↑ Tổng xuất: {fmtNum(totalExport)} {unit}
                        </div>
                        <div style={{
                            padding: '8px 16px', borderRadius: '8px',
                            background: '#e3f2fd', border: '1px solid #90caf9',
                            fontSize: '13px', fontWeight: '600', color: '#1565c0'
                        }}>
                            = Tồn lý thuyết: {fmtNum(totalImport - totalExport)} {unit}
                        </div>
                    </div>
                )}

                {/* Content */}
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
                                    {['Loại', 'Ngày', 'Số lượng', 'HSD', 'Đối tác', 'Ghi chú'].map(h => (
                                        <th key={h} style={{
                                            padding: '9px 12px', textAlign: 'left', fontWeight: '600',
                                            fontSize: '12px', color: 'var(--text-color)',
                                            borderBottom: '2px solid var(--border-color, #e0e0e0)',
                                            whiteSpace: 'nowrap',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((h, i) => {
                                    const isImport = h.type === 'import';
                                    return (
                                        <tr key={i} style={{
                                            backgroundColor: i % 2 === 0 ? 'var(--card-bg)' : 'var(--table-stripe-bg, #fafafa)',
                                            borderBottom: '1px solid var(--border-color, #eee)'
                                        }}>
                                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 10px', borderRadius: '12px',
                                                    fontSize: '12px', fontWeight: '600',
                                                    backgroundColor: isImport ? '#e8f5e9' : '#fff3e0',
                                                    color: isImport ? '#2e7d32' : '#e65100',
                                                    border: `1px solid ${isImport ? '#a5d6a7' : '#ffcc80'}`,
                                                }}>
                                                    {isImport ? '↓ Nhập' : '↑ Xuất'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontWeight: '500' }}>
                                                {fmtDateDisplay(h.date) || '—'}
                                            </td>
                                            <td style={{
                                                padding: '9px 12px', textAlign: 'right',
                                                fontWeight: '700', whiteSpace: 'nowrap',
                                                color: isImport ? '#2e7d32' : '#e65100'
                                            }}>
                                                {isImport ? '+' : '-'}{fmtNum(h.quantity)} {h.unit}
                                            </td>
                                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                                {fmtDateDisplay(h.expiryDate) || '—'}
                                            </td>
                                            <td style={{ padding: '9px 12px', maxWidth: '200px' }}>
                                                <span title={h.partner} style={{
                                                    display: 'block', overflow: 'hidden',
                                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    maxWidth: '200px'
                                                }}>{h.partner || '—'}</span>
                                            </td>
                                            <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                {h.description || '—'}
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
    const [stockModal, setStockModal] = useState({ isOpen: false, productId: '', data: [], loading: false });
    const [lotHistoryModal, setLotHistoryModal] = useState({ isOpen: false, productId: '', lotNumber: '' });
    const [webkhoDuplicateHsd, setWebkhoDuplicateHsd] = React.useState([]);

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
                const expiryKey = expiry
                    ? `${expiry.getFullYear()}-${expiry.getMonth()}-${expiry.getDate()}`
                    : 'no-date';
                const key = `${lotNumber}__${expiryKey}`;
                if (lotMap.has(key)) {
                    const existing = lotMap.get(key);
                    existing.quantityRemaining += lot.quantityRemaining || 0;
                    existing.quantityAllocated += lot.quantityAllocated || 0;
                } else {
                    lotMap.set(key, {
                        ...lot,
                        quantityRemaining: lot.quantityRemaining || 0,
                        quantityAllocated: lot.quantityAllocated || 0,
                    });
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
    const openLotHistory = (productId, lotNumber) => setLotHistoryModal({ isOpen: true, productId, lotNumber });
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
                    expiryDate: d.expiryDate ? (d.expiryDate.toDate ? d.expiryDate.toDate() : d.expiryDate) : null,
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

                if (!lotHsdMap.has(hsdTrackKey)) {
                    lotHsdMap.set(hsdTrackKey, { hsds: new Set(), lots: [] });
                }
                const tracker = lotHsdMap.get(hsdTrackKey);
                if (hsdStr) tracker.hsds.add(hsdStr);
                tracker.lots.push({ lotNumber: lot.lotNumber, hsd: hsdStr, qty: lot.quantityRemaining });

                if (lotMap.has(key)) {
                    lotMap.get(key).quantityRemaining += lot.quantityRemaining;
                } else {
                    lotMap.set(key, { ...lot, lotKey });
                }
            }

            for (const [hsdTrackKey, tracker] of lotHsdMap) {
                if (tracker.hsds.size > 1) {
                    const [productId, lotKey] = hsdTrackKey.split('__');
                    const lotNumber = tracker.lots[0].lotNumber;
                    const hsdList = [...tracker.hsds];
                    const alreadyWarned = newWebkhoDups.some(
                        d => d.productId === productId && normLot(d.lotNumber) === lotKey
                    );
                    if (!alreadyWarned) {
                        newWebkhoDups.push({
                            productId, lotNumber,
                            hsd1: hsdList[0], hsd2: hsdList[1],
                            totalQty: tracker.lots.reduce((s, l) => s + l.qty, 0),
                            count: tracker.lots.length,
                        });
                    }
                }
            }

            setWebkhoDuplicateHsd(newWebkhoDups);
            if (newWebkhoDups.length > 0) {
                toast.warn(`⚠️ WebKho có ${newWebkhoDups.length} lot cùng số lô nhưng khác HSD!`);
            }

            const finalLots = [...lotMap.values()];

            const prodsSnap = await getDocs(collection(db, 'products'));
            const newConvMap = {};
            const newMissingSet = new Set();
            const newAltMap = {};
            prodsSnap.forEach(doc => {
                const d = doc.data();
                const id = doc.id;
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
    // ĐỐI CHIẾU (bổ sung nhóm hsdlech)
    // ============================================================
    const { results, counts } = useMemo(() => {
        if (!webkhoLots.length && !misaItems.length) return { results: [], counts: {} };

        const misaLookup = new Map();
        for (const item of misaItems) {
            const key = `${item.ma}__${item.lotKey}`;
            misaLookup.set(key, item);
        }

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
                dvtMisa = misaItem.dvt;
                tonMisa = misaItem.sl;
                hsdMisa = fmtDateDisplay(misaItem.hsdRaw);
                const hsdWebkho = fmtDateDisplay(lot.expiryDate);
                hsdLech = hsdWebkho && hsdMisa && hsdWebkho !== hsdMisa;

                const diff = qtyWebkhoQd - tonMisa;
                chenhWebkho = diff / heySo;
                chenhMisa = heySo !== 1 ? diff : null;

                if (hsdLech) {
                    // Lệch HSD — đưa vào nhóm riêng dù số lượng có khớp hay không
                    nhom = 'hsdlech';
                    status = '🟣 Lệch HSD';
                } else if (Math.abs(diff) < 0.001) {
                    nhom = 'khop'; status = '✅ Khớp';
                } else if (diff > 0) {
                    nhom = 'chenh'; status = '⬆️ WebKho cao hơn';
                } else {
                    nhom = 'chenh'; status = '⬇️ WebKho thấp hơn';
                }
            } else {
                dvtMisa = ''; tonMisa = null; hsdMisa = '';
                chenhWebkho = null; chenhMisa = null; hsdLech = false;
                if (missingMisaCodesSet.has(lot.productId)) {
                    nhom = 'nomisa'; status = '🔴 Misa chưa có mã';
                } else {
                    nhom = 'webkho'; status = '🟡 Chỉ có trên WebKho';
                }
            }

            results.push({
                nhom, productId: lot.productId, lotNumber: lot.lotNumber,
                hsdWebkho: fmtDateDisplay(lot.expiryDate), dvtWebkho: lot.unit,
                tonWebkho: lot.quantityRemaining, heySo, tonWebkhoQd: qtyWebkhoQd,
                dvtMisa, tonMisa, hsdMisa, hsdLech: !!hsdLech, chenhWebkho, chenhMisa, status,
            });
        }

        for (const item of misaItems) {
            const key = `${item.ma}__${item.lotKey}`;
            if (!matchedMisaKeys.has(key)) {
                results.push({
                    nhom: 'misa', productId: item.ma, lotNumber: item.lo,
                    hsdWebkho: '', dvtWebkho: '', tonWebkho: null, heySo: null, tonWebkhoQd: null,
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
        const tabOrder = ['chenh','khop','hsdlech','webkho','misa','nomisa'];
        const tabLabel = {
            chenh:'Chênh lệch', khop:'Khớp', hsdlech:'Lệch HSD',
            webkho:'Chỉ WebKho', misa:'Chỉ Misa', nomisa:'Misa thiếu mã'
        };

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
    // RENDER
    // ============================================================
    const hasData = webkhoLots.length > 0 || misaItems.length > 0;
    const canReconcile = webkhoLots.length > 0 && misaItems.length > 0;

    // ── Banner cảnh báo HSD trùng (WebKho / Misa) ──
    const DuplicateHsdWarning = ({ warnings, source }) => {
        if (!warnings.length) return null;
        const isMisa = source === 'misa';
        return (
            <div style={{
                backgroundColor: isMisa ? '#fff8e1' : '#fce4ec',
                border: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}`,
                borderLeft: `4px solid ${isMisa ? '#f9a825' : '#e91e63'}`,
                borderRadius: '6px', padding: '12px 16px', marginBottom: '16px',
            }}>
                <div style={{ fontWeight: '600', color: isMisa ? '#e65100' : '#c2185b', marginBottom: '8px', fontSize: '14px' }}>
                    ⚠️ {isMisa ? 'Misa' : 'WebKho'}: Phát hiện {warnings.length} lot cùng số lô nhưng khác HSD
                    {!isMisa && ' — Dữ liệu nhập kho có thể bị lỗi, cần kiểm tra lại!'}
                    {isMisa && ' — cần kiểm tra lại trên Misa!'}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ backgroundColor: isMisa ? '#fff3cd' : '#fce4ec' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}` }}>Mã hàng</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}` }}>Số lô</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}` }}>HSD 1</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${isMisa ? '#f9a825' : '#e91e63'}` }}>HSD 2</th>
                            {!isMisa && <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e91e63' }}>Số docs</th>}
                            {!isMisa && <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #e91e63' }}>Tổng tồn</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {warnings.map((w, i) => (
                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? (isMisa ? '#fffde7' : '#fce4ec') : (isMisa ? '#fff8e1' : '#f8bbd0') }}>
                                <td style={{ padding: '5px 10px', fontWeight: '600', color: '#333' }}>{isMisa ? w.ma : w.productId}</td>
                                <td style={{ padding: '5px 10px', color: '#555' }}>{isMisa ? w.lo : w.lotNumber}</td>
                                <td style={{ padding: '5px 10px', color: '#c0392b' }}>{w.hsd1}</td>
                                <td style={{ padding: '5px 10px', color: '#c0392b' }}>{w.hsd2}</td>
                                {!isMisa && <td style={{ padding: '5px 10px', textAlign: 'right', color: '#555' }}>{w.count} docs</td>}
                                {!isMisa && <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '600' }}>{fmtNum(w.totalQty)}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#795548' }}>
                    {isMisa
                        ? '💡 Số lượng đã được cộng dồn — chỉ cần sửa HSD đúng trên Misa rồi xuất file mới.'
                        : '💡 Hệ thống đã cộng dồn số lượng — nhưng cần kiểm tra lại phiếu nhập để sửa HSD cho đúng.'
                    }
                </div>
            </div>
        );
    };

    // ── Banner cảnh báo Lệch HSD giữa WebKho và Misa ──
    const HsdMismatchBanner = ({ rows }) => {
        const mismatches = rows.filter(r => r.nhom === 'hsdlech');
        if (!mismatches.length) return null;
        return (
            <div style={{
                backgroundColor: '#f3e8ff',
                border: '1px solid #a855f7',
                borderLeft: '4px solid #7c3aed',
                borderRadius: '6px', padding: '12px 16px', marginBottom: '16px',
            }}>
                <div style={{ fontWeight: '600', color: '#6d28d9', marginBottom: '8px', fontSize: '14px' }}>
                    🟣 Phát hiện {mismatches.length} lot khớp số lô nhưng HSD ghi khác nhau giữa WebKho và Misa
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#ede9fe' }}>
                            {['Mã hàng', 'Số lô', 'HSD WebKho', 'HSD Misa', 'Chênh lệch SL'].map(h => (
                                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #a855f7', color: '#5b21b6' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {mismatches.slice(0, 10).map((r, i) => (
                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#f5f3ff' : '#ede9fe' }}>
                                <td style={{ padding: '5px 10px', fontWeight: '600', color: '#333' }}>
                                    <button
                                        onClick={() => { setActiveTab('hsdlech'); setSearch(r.productId); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', textDecoration: 'underline', fontWeight: '600', padding: 0, fontSize: 'inherit' }}
                                    >{r.productId}</button>
                                </td>
                                <td style={{ padding: '5px 10px', color: '#555' }}>{r.lotNumber}</td>
                                <td style={{ padding: '5px 10px', color: '#c0392b', fontWeight: '500' }}>{r.hsdWebkho || '—'}</td>
                                <td style={{ padding: '5px 10px', color: '#c0392b', fontWeight: '500' }}>{r.hsdMisa || '—'}</td>
                                <td style={{ padding: '5px 10px', color: r.chenhWebkho ? (r.chenhWebkho > 0 ? '#e67e22' : '#e74c3c') : '#27ae60', fontWeight: '600' }}>
                                    {r.chenhWebkho != null && Math.abs(r.chenhWebkho) >= 0.001
                                        ? fmtChenh(r.chenhWebkho, r.dvtWebkho)
                                        : '✅ Khớp SL'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {mismatches.length > 10 && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#6d28d9' }}>
                        ... và {mismatches.length - 10} lot khác.
                        <button onClick={() => setActiveTab('hsdlech')} style={{
                            marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer',
                            color: '#7c3aed', textDecoration: 'underline', fontSize: '12px'
                        }}>Xem tất cả →</button>
                    </div>
                )}
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#6d28d9' }}>
                    💡 Không kết luận bên nào đúng — cần kiểm tra phiếu nhập gốc để xác định HSD chính xác.
                    Bấm vào tab <strong>Lệch HSD</strong> để xem đầy đủ và xem lịch sử từng lot.
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
                            {(() => { const d = lastUpdated ? new Date(lastUpdated) : null; return d ? `Dữ liệu WebKho: ${fmtDateDisplay(d)} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''; })()}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
                        <button onClick={() => { if (window.confirm('Xóa toàn bộ dữ liệu đối chiếu hiện tại?')) { reset(); setWebkhoDuplicateHsd([]); } }}
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
                            <div key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                                padding: '10px 16px', borderRadius: '8px', cursor: 'pointer',
                                border: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                                backgroundColor: activeTab === tab.key ? tab.bgColor : 'var(--card-bg)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)', minWidth: '100px', transition: 'all 0.15s ease',
                            }}>
                                <div style={{ fontSize: '22px', fontWeight: '700', color: tab.color }}>{counts[tab.key] || 0}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{tab.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* SEARCH */}
                    <div style={{ marginBottom: '12px' }}>
                        <input type="text" placeholder="Tìm theo mã hàng hoặc số lot..."
                            value={search} onChange={e => setSearch(e.target.value)}
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

                    {/* BẢNG KẾT QUẢ — compact, không cần scroll ngang */}
                    <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: '90px' }}  />{/* Mã hàng */}
                                <col style={{ width: '80px' }}  />{/* Số lot */}
                                <col style={{ width: '72px' }}  />{/* HSD WebKho */}
                                <col style={{ width: '48px' }}  />{/* ĐVT WK */}
                                <col style={{ width: '68px' }}  />{/* Tồn WK */}
                                <col style={{ width: '36px' }}  />{/* Hệ số */}
                                <col style={{ width: '68px' }}  />{/* Tồn qđ */}
                                <col style={{ width: '48px' }}  />{/* ĐVT Misa */}
                                <col style={{ width: '68px' }}  />{/* Tồn Misa */}
                                <col style={{ width: '72px' }}  />{/* HSD Misa */}
                                <col style={{ width: '90px' }}  />{/* Chênh */}
                                <col style={{ width: '110px' }} />{/* Trạng thái */}
                                <col style={{ width: '62px' }}  />{/* Lịch sử */}
                            </colgroup>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--table-header-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                                    {[
                                        { label: 'Mã hàng',    align: 'left'   },
                                        { label: 'Số lot',     align: 'left'   },
                                        { label: 'HSD WK',     align: 'center' },
                                        { label: 'ĐVT WK',    align: 'center' },
                                        { label: 'Tồn WK',    align: 'right'  },
                                        { label: '×',          align: 'center' },
                                        { label: 'Tồn QĐ',   align: 'right'  },
                                        { label: 'ĐVT Misa',  align: 'center' },
                                        { label: 'Tồn Misa',  align: 'right'  },
                                        { label: 'HSD Misa',  align: 'center' },
                                        { label: 'Chênh',     align: 'right'  },
                                        { label: 'Trạng thái',align: 'left'   },
                                        { label: '',           align: 'center' },
                                    ].map((h, idx) => (
                                        <th key={idx} style={{
                                            padding: '8px 6px', textAlign: h.align, fontWeight: '600',
                                            fontSize: '11px', color: 'var(--text-color)',
                                            borderBottom: '2px solid var(--border-color)', whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                        }}>{h.label}</th>
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
                                    const hasDupHsd = webkhoDuplicateHsd.some(
                                        d => d.productId === r.productId && normLot(d.lotNumber) === normLot(r.lotNumber)
                                    );
                                    const isHsdLech = r.nhom === 'hsdlech';
                                    // Chênh: chỉ hiện theo ĐVT WebKho (nếu hệ số=1); nếu hệ số≠1 thêm tooltip
                                    const chenhDisplay = r.chenhWebkho != null ? fmtChenh(r.chenhWebkho, r.dvtWebkho) : '';
                                    const chenhTitle = (r.chenhMisa != null && r.heySo !== 1)
                                        ? `Theo ĐVT Misa: ${fmtChenh(r.chenhMisa, r.dvtMisa)}`
                                        : '';
                                    return (
                                        <tr key={i} style={{
                                            backgroundColor: hasDupHsd ? '#fce4ec' : isHsdLech ? '#f5f3ff' : rowBg,
                                            outline: hasDupHsd ? '1px solid #e91e63' : isHsdLech ? '1px solid #a855f7' : 'none',
                                        }}>
                                            {/* Mã hàng */}
                                            <td style={tdCompact}>
                                                <button onClick={() => openStockModal(r.productId)} style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: hasDupHsd ? '#c2185b' : isHsdLech ? '#7c3aed' : '#007bff',
                                                    textDecoration: 'underline', fontWeight: '600',
                                                    fontSize: 'inherit', padding: 0,
                                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap', maxWidth: '100%', display: 'block',
                                                }} title={r.productId + (hasDupHsd ? ' ⚠️ Trùng HSD trong WebKho' : '')}>
                                                    {r.productId}{hasDupHsd ? '⚠' : ''}
                                                </button>
                                            </td>
                                            {/* Số lot */}
                                            <td style={{ ...tdCompact, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.lotNumber}>{r.lotNumber}</td>
                                            {/* HSD WebKho */}
                                            <td style={{
                                                ...tdCompact, textAlign: 'center',
                                                color: isHsdLech ? '#7c3aed' : 'var(--text-color)',
                                                fontWeight: isHsdLech ? '600' : 'normal',
                                            }}>{r.hsdWebkho}</td>
                                            {/* ĐVT WebKho */}
                                            <td style={{ ...tdCompact, textAlign: 'center', color: 'var(--text-secondary)' }}>{r.dvtWebkho}</td>
                                            {/* Tồn WebKho */}
                                            <td style={{ ...tdCompact, textAlign: 'right' }}>{r.tonWebkho != null ? fmtNum(r.tonWebkho) : ''}</td>
                                            {/* Hệ số */}
                                            <td style={{ ...tdCompact, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px' }}>
                                                {r.heySo != null && r.heySo !== 1 ? r.heySo : ''}
                                            </td>
                                            {/* Tồn quy đổi — chỉ hiện nếu hệ số ≠ 1 */}
                                            <td style={{ ...tdCompact, textAlign: 'right', color: 'var(--text-secondary)' }}>
                                                {r.heySo != null && r.heySo !== 1 && r.tonWebkhoQd != null ? fmtNum(r.tonWebkhoQd) : ''}
                                            </td>
                                            {/* ĐVT Misa */}
                                            <td style={{ ...tdCompact, textAlign: 'center', color: 'var(--text-secondary)' }}>{r.dvtMisa}</td>
                                            {/* Tồn Misa */}
                                            <td style={{ ...tdCompact, textAlign: 'right' }}>{r.tonMisa != null ? fmtNum(r.tonMisa) : ''}</td>
                                            {/* HSD Misa */}
                                            <td style={{
                                                ...tdCompact, textAlign: 'center',
                                                color: isHsdLech ? '#7c3aed' : 'var(--text-color)',
                                                fontWeight: isHsdLech ? '600' : 'normal',
                                            }}>{r.hsdMisa}</td>
                                            {/* Chênh (gộp 2 cột cũ, tooltip khi hệ số ≠ 1) */}
                                            <td style={{ ...tdCompact, textAlign: 'right', fontWeight: '600', color: chenhColor }}
                                                title={chenhTitle}>
                                                {chenhDisplay}
                                                {chenhTitle && <span style={{ fontSize: '10px', color: '#999', marginLeft: '2px' }}>*</span>}
                                            </td>
                                            {/* Trạng thái — icon + text ngắn */}
                                            <td style={{ ...tdCompact, overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                title={r.status}>
                                                {r.status}
                                            </td>
                                            {/* Nút lịch sử */}
                                            <td style={{ ...tdCompact, textAlign: 'center', padding: '4px' }}>
                                                {r.lotNumber ? (
                                                    <button
                                                        onClick={() => openLotHistory(r.productId, r.lotNumber)}
                                                        title={`Lịch sử lot ${r.lotNumber}`}
                                                        style={{
                                                            background: '#f3e8ff', border: '1px solid #a855f7',
                                                            borderRadius: '5px', cursor: 'pointer',
                                                            padding: '3px 6px', color: '#7c3aed',
                                                            fontSize: '11px', display: 'inline-flex',
                                                            alignItems: 'center', gap: '3px',
                                                        }}
                                                    >
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

            {/* MODAL TỒN KHO NHANH */}
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
                                        return (
                                            <tr key={lot.id} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '8px' }}>{lot.lotNumber || '(Không có)'}</td>
                                                <td style={{ padding: '8px' }}>{lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{formatNumber(lot.quantityRemaining)}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', color: '#e67e22' }}>{allocated > 0 ? formatNumber(allocated) : '-'}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', color: 'green', fontWeight: 'bold' }}>{formatNumber(available)}</td>
                                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                                    {lot.lotNumber && (
                                                        <button
                                                            onClick={() => { closeStockModal(); openLotHistory(stockModal.productId, lot.lotNumber); }}
                                                            style={{
                                                                background: 'none', border: '1px solid #7c3aed',
                                                                borderRadius: '5px', cursor: 'pointer',
                                                                padding: '3px 8px', color: '#7c3aed',
                                                                fontSize: '12px', display: 'inline-flex',
                                                                alignItems: 'center', gap: '4px',
                                                            }}
                                                        >
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

const tdStyle = {
    padding: '9px 12px',
    borderBottom: '1px solid var(--border-color)',
    color: 'var(--text-color)',
    whiteSpace: 'nowrap',
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