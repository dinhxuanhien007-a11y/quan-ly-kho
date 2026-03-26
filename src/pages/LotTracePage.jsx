// src/pages/LotTracePage.jsx
import { useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { toast } from 'react-toastify';
import { formatDate } from '../utils/dateUtils';
import { FiSearch, FiPackage, FiTrendingUp, FiTrendingDown, FiBarChart2, FiChevronDown, FiChevronUp, FiUser, FiTruck, FiFileText, FiX, FiCheckCircle, FiCircle } from 'react-icons/fi';

function normLot(s) {
    if (!s) return '';
    return String(s).trim().toUpperCase().replace(/^0+/, '') || '';
}

function fmtNum(val) {
    if (val === null || val === undefined || val === '') return '';
    const n = Number(val);
    if (isNaN(n)) return String(val);
    const rounded = Math.round(n * 100) / 100;
    if (rounded === Math.floor(rounded)) return rounded.toLocaleString('vi-VN');
    return rounded.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Xử lý date an toàn: Timestamp, string, Date, null
function safeFormatDate(val) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val.toDate === 'function') return formatDate(val);
    if (val instanceof Date) return formatDate(val);
    return String(val);
}

// Lấy timestamp để sort (cũ nhất lên đầu)
function getDateTimestamp(val) {
    if (!val) return 0;
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val instanceof Date) return val.getTime();
    if (typeof val === 'string') {
        const parts = val.split('/');
        if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
        return new Date(val).getTime() || 0;
    }
    return 0;
}

const LotTracePage = () => {
    const [productId, setProductId] = useState('');
    const [lotNumber, setLotNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [expandedTickets, setExpandedTickets] = useState(new Set());
    const [matchedTickets, setMatchedTickets] = useState(new Set());
    const [modalTicket, setModalTicket] = useState(null);
    const [modalType, setModalType] = useState(null);

    const toggleTicket = (ticketId) => {
        setExpandedTickets(prev => {
            const newSet = new Set(prev);
            if (newSet.has(ticketId)) {
                newSet.delete(ticketId);
            } else {
                newSet.add(ticketId);
            }
            return newSet;
        });
    };

    const toggleMatched = (ticketId) => {
        setMatchedTickets(prev => {
            const newSet = new Set(prev);
            if (newSet.has(ticketId)) {
                newSet.delete(ticketId);
            } else {
                newSet.add(ticketId);
            }
            return newSet;
        });
    };

    const openTicketModal = async (ticketId, type) => {
        try {
            const collectionName = type === 'export' ? 'export_tickets' : 'import_tickets';
            const docRef = doc(db, collectionName, ticketId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const ticketData = { id: docSnap.id, ...docSnap.data() };
                
                // Lấy productName từ item trực tiếp nếu có, chỉ query products nếu thiếu
                const missingNameIds = [...new Set(
                    ticketData.items
                        .filter(item => !item.productName)
                        .map(item => item.productId)
                )];

                let productDetailsMap = {};
                if (missingNameIds.length > 0) {
                    const productSnapshots = await Promise.all(
                        missingNameIds.map(pid => getDoc(doc(db, 'products', pid)))
                    );
                    productDetailsMap = productSnapshots.reduce((acc, docSn) => {
                        if (docSn.exists()) acc[docSn.id] = docSn.data();
                        return acc;
                    }, {});
                }

                ticketData.items = ticketData.items.map(item => ({
                    ...item,
                    productName: item.productName || productDetailsMap[item.productId]?.name || productDetailsMap[item.productId]?.productName || item.productId,
                }));

                setModalTicket(ticketData);
                setModalType(type);
            } else {
                toast.error('Không tìm thấy phiếu');
            }
        } catch (error) {
            console.error('Lỗi khi tải chi tiết phiếu:', error);
            toast.error('Lỗi: ' + error.message);
        }
    };

    const closeModal = () => {
        setModalTicket(null);
        setModalType(null);
    };

    const handleSearch = async () => {
        if (!productId && !lotNumber) {
            toast.error('Vui lòng nhập ít nhất mã hàng hoặc số lot');
            return;
        }

        setLoading(true);
        setResults(null);
        setMatchedTickets(new Set());

        try {
            const pidTrim = productId.trim();
            const normLotNum = normLot(lotNumber);

            // Tìm phiếu xuất
            let exportQuery;
            if (pidTrim) {
                exportQuery = query(collection(db, 'export_tickets'), where('productIds', 'array-contains', pidTrim));
            } else {
                exportQuery = query(collection(db, 'export_tickets'));
            }
            
            const exportSnap = await getDocs(exportQuery);


            const exportDetails = [];
            let totalExportQty = 0;

            exportSnap.forEach(doc => {
                const d = doc.data();
                const allItems = d.items || [];
                
                // Lọc items khớp điều kiện
                const matchingItems = allItems.filter(item => {
                    const itemPid = String(item.productId || '').trim();
                    const itemLot = normLot(item.lotNumber);
                    
                    // Nếu có cả mã hàng và số lot
                    if (pidTrim && normLotNum) {
                        return itemPid === pidTrim && itemLot === normLotNum;
                    }
                    // Nếu chỉ có mã hàng
                    if (pidTrim) {
                        return itemPid === pidTrim;
                    }
                    // Nếu chỉ có số lot
                    if (normLotNum) {
                        return itemLot === normLotNum;
                    }
                    return false;
                });

                if (matchingItems.length > 0) {
                    matchingItems.forEach(item => {
                        const qty = item.quantityToExport || 0;
                        totalExportQty += qty;
                    });

                    exportDetails.push({
                        id: doc.id,
                        date: d.exportDate,
                        customer: d.customer || d.customerId,
                        status: d.status,
                        description: d.description || '',
                        allItems: allItems,
                        matchingItems: matchingItems,
                    });
                }
            });

            // Tìm phiếu nhập
            let importQuery;
            if (pidTrim) {
                importQuery = query(collection(db, 'import_tickets'), where('productIds', 'array-contains', pidTrim));
            } else {
                importQuery = query(collection(db, 'import_tickets'));
            }
            
            const importSnap = await getDocs(importQuery);

            const importDetails = [];
            let totalImportQty = 0;

            importSnap.forEach(doc => {
                const d = doc.data();
                const allItems = d.items || [];
                
                const matchingItems = allItems.filter(item => {
                    const itemPid = String(item.productId || '').trim();
                    const itemLot = normLot(item.lotNumber);
                    
                    if (pidTrim && normLotNum) {
                        return itemPid === pidTrim && itemLot === normLotNum;
                    }
                    if (pidTrim) {
                        return itemPid === pidTrim;
                    }
                    if (normLotNum) {
                        return itemLot === normLotNum;
                    }
                    return false;
                });

                if (matchingItems.length > 0) {
                    matchingItems.forEach(item => {
                        totalImportQty += item.quantity || 0;
                    });

                    importDetails.push({
                        id: doc.id,
                        date: d.importDate,
                        supplier: d.supplierName || d.supplierId,
                        description: d.description || '',
                        allItems: allItems,
                        matchingItems: matchingItems,
                    });
                }
            });

            // Làm giàu dữ liệu sản phẩm cho tất cả items
            const allProductIds = new Set();
            exportDetails.forEach(exp => {
                exp.allItems.forEach(item => { if (!item.productName) allProductIds.add(item.productId); });
            });
            importDetails.forEach(imp => {
                imp.allItems.forEach(item => { if (!item.productName) allProductIds.add(item.productId); });
            });

            let productDetailsMap = {};
            if (allProductIds.size > 0) {
                const productPromises = Array.from(allProductIds).map(pid => getDoc(doc(db, 'products', pid)));
                const productSnapshots = await Promise.all(productPromises);
                productDetailsMap = productSnapshots.reduce((acc, docSn) => {
                    if (docSn.exists()) {
                        acc[docSn.id] = docSn.data();
                    }
                    return acc;
                }, {});
            }

            const resolveProductName = (item) =>
                item.productName ||
                productDetailsMap[item.productId]?.name ||
                productDetailsMap[item.productId]?.productName ||
                item.productId;

            // Thêm tên sản phẩm vào items
            exportDetails.forEach(exp => {
                exp.allItems = exp.allItems.map(item => ({ ...item, productName: resolveProductName(item) }));
                exp.matchingItems = exp.matchingItems.map(item => ({ ...item, productName: resolveProductName(item) }));
            });

            importDetails.forEach(imp => {
                imp.allItems = imp.allItems.map(item => ({ ...item, productName: resolveProductName(item) }));
                imp.matchingItems = imp.matchingItems.map(item => ({ ...item, productName: resolveProductName(item) }));
            });

            // Sắp xếp phiếu cũ nhất lên đầu
            exportDetails.sort((a, b) => getDateTimestamp(a.date) - getDateTimestamp(b.date));
            importDetails.sort((a, b) => getDateTimestamp(a.date) - getDateTimestamp(b.date));

            // Tính tổng số lượng matching cho mỗi phiếu xuất
            exportDetails.forEach(exp => {
                exp.matchingQty = exp.matchingItems.reduce((sum, item) => sum + (item.quantityToExport || 0), 0);
            });
            importDetails.forEach(imp => {
                imp.matchingQty = imp.matchingItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
            });

            setResults({
                exportDetails,
                importDetails,
                totalImportQty,
                totalExportQty,
                theoreticalStock: totalImportQty - totalExportQty,
            });
        } catch (error) {
            console.error('❌ Lỗi:', error);
            toast.error('Lỗi: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ marginBottom: '30px' }}>
                <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '600', color: 'var(--text-color)' }}>
                    Truy Vết Lô Hàng
                </h1>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Xem lịch sử nhập/xuất chi tiết của từng lô hàng
                </p>
            </div>
            
            <div style={{ marginBottom: '30px', padding: '24px', backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '12px', alignItems: 'end' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-color)' }}>
                            Mã hàng
                        </label>
                        <input
                            type="text"
                            placeholder="Nhập mã hàng..."
                            value={productId}
                            onChange={(e) => setProductId(e.target.value.toUpperCase())}
                            onKeyDown={handleKeyPress}
                            style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '14px', width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-color)' }}>
                            Số lot
                        </label>
                        <input
                            type="text"
                            placeholder="Nhập số lot..."
                            value={lotNumber}
                            onChange={(e) => setLotNumber(e.target.value)}
                            onKeyDown={handleKeyPress}
                            style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '14px', width: '100%' }}
                        />
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        style={{ padding: '10px 24px', borderRadius: '6px', border: 'none', backgroundColor: loading ? '#ccc' : '#007bff', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
                    >
                        <FiSearch style={{ fontSize: '16px' }} />
                        {loading ? 'Đang tìm...' : 'Tìm kiếm'}
                    </button>
                    {results && (
                        <button
                            onClick={() => { setProductId(''); setLotNumber(''); setResults(null); setMatchedTickets(new Set()); }}
                            title="Xóa tìm kiếm"
                            style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: 'white', color: '#666', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                        >
                            <FiX style={{ fontSize: '16px' }} />
                            Xóa
                        </button>
                    )}
                </div>
            </div>

            {results && (
                <div>
                    {/* Tổng kết */}
                    <div style={{ marginBottom: '24px', padding: '24px', backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '2px solid #4caf50', boxShadow: '0 4px 12px rgba(76, 175, 80, 0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <FiBarChart2 style={{ fontSize: '20px', color: '#4caf50' }} />
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-color)' }}>Tổng kết</h2>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#e8f5e9', border: '1px solid #a5d6a7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <FiTrendingDown style={{ fontSize: '18px', color: '#2e7d32' }} />
                                    <div style={{ fontSize: '12px', color: '#2e7d32', fontWeight: '600' }}>Tổng nhập</div>
                                </div>
                                <div style={{ fontSize: '28px', fontWeight: '700', color: '#2e7d32' }}>{fmtNum(results.totalImportQty)}</div>
                            </div>
                            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <FiTrendingUp style={{ fontSize: '18px', color: '#e65100' }} />
                                    <div style={{ fontSize: '12px', color: '#e65100', fontWeight: '600' }}>Tổng xuất</div>
                                </div>
                                <div style={{ fontSize: '28px', fontWeight: '700', color: '#e65100' }}>{fmtNum(results.totalExportQty)}</div>
                            </div>
                            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#e3f2fd', border: '1px solid #90caf9' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <FiPackage style={{ fontSize: '18px', color: '#1976d2' }} />
                                    <div style={{ fontSize: '12px', color: '#1976d2', fontWeight: '600' }}>Tồn lý thuyết</div>
                                </div>
                                <div style={{ fontSize: '28px', fontWeight: '700', color: '#1976d2' }}>{fmtNum(results.theoreticalStock)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Phiếu xuất */}
                    <div style={{ marginBottom: '24px' }}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: 'var(--text-color)' }}>
                            📤 Phiếu xuất ({results.exportDetails.length})
                        </h2>
                        {results.exportDetails.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                Không có phiếu xuất nào
                            </div>
                        ) : (
                            results.exportDetails.map((exp, idx) => {
                                const isExpanded = expandedTickets.has(exp.id);
                                const hiddenCount = exp.allItems.length - exp.matchingItems.length;
                                const isMatched = matchedTickets.has(exp.id);
                                
                                return (
                                    <div key={idx} style={{ marginBottom: '16px', padding: '20px', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: `1px solid ${isMatched ? '#4caf50' : '#ff9800'}`, boxShadow: isMatched ? '0 2px 6px rgba(76, 175, 80, 0.15)' : '0 2px 6px rgba(255, 152, 0, 0.1)', opacity: isMatched ? 0.75 : 1, transition: 'all 0.2s' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-color)' }}>
                                                        Phiếu: {exp.id}
                                                    </div>
                                                    {isMatched && (
                                                        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', backgroundColor: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' }}>
                                                            ✓ Đã khớp
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#fff3e0', borderRadius: '6px', border: '1px solid #ffcc80' }}>
                                                        <FiUser style={{ fontSize: '14px', color: '#e65100' }} />
                                                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#e65100' }}>{exp.customer}</span>
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                        📅 {safeFormatDate(exp.date)}
                                                    </div>
                                                    {exp.matchingQty > 0 && (
                                                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', padding: '4px 10px', backgroundColor: '#fff3e0', borderRadius: '6px', border: '1px solid #ffcc80' }}>
                                                            📦 {fmtNum(exp.matchingQty)} {exp.matchingItems[0]?.unit || ''}
                                                        </div>
                                                    )}
                                                </div>
                                                {exp.description && (
                                                    <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#fff9e6', borderRadius: '6px', border: '1px solid #ffe0b2', fontSize: '12px', color: '#e65100', fontStyle: 'italic' }}>
                                                        💬 {exp.description}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                                                <div style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: exp.status === 'completed' ? '#e8f5e9' : '#fff3e0', color: exp.status === 'completed' ? '#2e7d32' : '#e65100', border: `1px solid ${exp.status === 'completed' ? '#a5d6a7' : '#ffcc80'}` }}>
                                                    {exp.status === 'completed' ? 'Hoàn thành' : exp.status}
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        onClick={() => toggleMatched(exp.id)}
                                                        title={isMatched ? 'Bỏ đánh dấu khớp' : 'Đánh dấu đã khớp'}
                                                        style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${isMatched ? '#4caf50' : '#ccc'}`, backgroundColor: isMatched ? '#e8f5e9' : 'white', color: isMatched ? '#2e7d32' : '#888', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}
                                                    >
                                                        {isMatched ? <FiCheckCircle style={{ fontSize: '14px' }} /> : <FiCircle style={{ fontSize: '14px' }} />}
                                                        {isMatched ? 'Đã khớp' : 'Đánh dấu khớp'}
                                                    </button>
                                                    <button
                                                        onClick={() => openTicketModal(exp.id, 'export')}
                                                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ff9800', backgroundColor: 'white', color: '#e65100', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}
                                                    >
                                                        <FiFileText style={{ fontSize: '14px' }} />
                                                        Chi tiết
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {hiddenCount > 0 && !isExpanded && (
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                                Hiển thị {exp.matchingItems.length} items khớp điều kiện • {hiddenCount} items khác trong phiếu
                                            </div>
                                        )}
                                        
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: 'var(--table-header-bg, #f8f9fa)' }}>
                                                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Mã hàng</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Tên hàng</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Số lot</th>
                                                    <th style={{ padding: '8px', textAlign: 'right', border: '1px solid var(--border-color)', fontWeight: '600' }}>Số lượng</th>
                                                    <th style={{ padding: '8px', textAlign: 'center', border: '1px solid var(--border-color)', fontWeight: '600' }}>ĐVT</th>
                                                    <th style={{ padding: '8px', textAlign: 'center', border: '1px solid var(--border-color)', fontWeight: '600' }}>HSD</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(isExpanded ? exp.allItems : exp.matchingItems).map((item, i) => {
                                                    const isMatching = exp.matchingItems.some(m => 
                                                        m.productId === item.productId && 
                                                        normLot(m.lotNumber) === normLot(item.lotNumber)
                                                    );
                                                    return (
                                                        <tr key={i} style={{ 
                                                            backgroundColor: isMatching ? '#fff9e6' : (i % 2 === 0 ? 'var(--card-bg)' : 'var(--table-stripe-bg, #fafafa)'),
                                                            borderLeft: isMatching ? '3px solid #ff9800' : 'none'
                                                        }}>
                                                            <td style={{ padding: '8px', border: '1px solid var(--border-color)', fontWeight: isMatching ? '600' : 'normal' }}>{item.productId}</td>
                                                            <td style={{ padding: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }}>{item.productName}</td>
                                                            <td style={{ padding: '8px', border: '1px solid var(--border-color)', fontWeight: isMatching ? '600' : 'normal' }}>{item.lotNumber}</td>
                                                            <td style={{ padding: '8px', textAlign: 'right', border: '1px solid var(--border-color)', fontWeight: '600', color: isMatching ? '#e65100' : 'var(--text-color)' }}>{fmtNum(item.quantityToExport)}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>{item.unit}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>{safeFormatDate(item.expiryDate)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        
                                        {hiddenCount > 0 && (
                                            <button
                                                onClick={() => toggleTicket(exp.id)}
                                                style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '6px', border: '1px solid #ff9800', backgroundColor: 'transparent', color: '#e65100', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                                            >
                                                {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                {isExpanded ? 'Thu gọn' : `Xem toàn bộ phiếu (+${hiddenCount} items)`}
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Phiếu nhập */}
                    <div>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: 'var(--text-color)' }}>
                            📥 Phiếu nhập ({results.importDetails.length})
                        </h2>
                        {results.importDetails.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                Không có phiếu nhập nào
                            </div>
                        ) : (
                            results.importDetails.map((imp, idx) => {
                                const isExpanded = expandedTickets.has(imp.id);
                                const hiddenCount = imp.allItems.length - imp.matchingItems.length;
                                
                                return (
                                    <div key={idx} style={{ marginBottom: '16px', padding: '20px', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid #4caf50', boxShadow: '0 2px 6px rgba(76, 175, 80, 0.1)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-color)', marginBottom: '8px' }}>
                                                    Phiếu: {imp.id}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#e8f5e9', borderRadius: '6px', border: '1px solid #a5d6a7' }}>
                                                        <FiTruck style={{ fontSize: '14px', color: '#2e7d32' }} />
                                                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#2e7d32' }}>{imp.supplier}</span>
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                        📅 {safeFormatDate(imp.date)}
                                                    </div>
                                                    {imp.matchingQty > 0 && (
                                                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#2e7d32', padding: '4px 10px', backgroundColor: '#e8f5e9', borderRadius: '6px', border: '1px solid #a5d6a7' }}>
                                                            📦 {fmtNum(imp.matchingQty)} {imp.matchingItems[0]?.unit || ''}
                                                        </div>
                                                    )}
                                                </div>
                                                {imp.description && (
                                                    <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#e8f9e8', borderRadius: '6px', border: '1px solid #c8e6c9', fontSize: '12px', color: '#2e7d32', fontStyle: 'italic' }}>
                                                        💬 {imp.description}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => openTicketModal(imp.id, 'import')}
                                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #4caf50', backgroundColor: 'white', color: '#2e7d32', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}
                                            >
                                                <FiFileText style={{ fontSize: '14px' }} />
                                                Chi tiết
                                            </button>
                                        </div>
                                        
                                        {hiddenCount > 0 && !isExpanded && (
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                                Hiển thị {imp.matchingItems.length} items khớp điều kiện • {hiddenCount} items khác trong phiếu
                                            </div>
                                        )}
                                        
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: 'var(--table-header-bg, #f8f9fa)' }}>
                                                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Mã hàng</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Tên hàng</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Số lot</th>
                                                    <th style={{ padding: '8px', textAlign: 'right', border: '1px solid var(--border-color)', fontWeight: '600' }}>Số lượng</th>
                                                    <th style={{ padding: '8px', textAlign: 'center', border: '1px solid var(--border-color)', fontWeight: '600' }}>ĐVT</th>
                                                    <th style={{ padding: '8px', textAlign: 'center', border: '1px solid var(--border-color)', fontWeight: '600' }}>HSD</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(isExpanded ? imp.allItems : imp.matchingItems).map((item, i) => {
                                                    const isMatching = imp.matchingItems.some(m => 
                                                        m.productId === item.productId && 
                                                        normLot(m.lotNumber) === normLot(item.lotNumber)
                                                    );
                                                    return (
                                                        <tr key={i} style={{ 
                                                            backgroundColor: isMatching ? '#e8f9e8' : (i % 2 === 0 ? 'var(--card-bg)' : 'var(--table-stripe-bg, #fafafa)'),
                                                            borderLeft: isMatching ? '3px solid #4caf50' : 'none'
                                                        }}>
                                                            <td style={{ padding: '8px', border: '1px solid var(--border-color)', fontWeight: isMatching ? '600' : 'normal' }}>{item.productId}</td>
                                                            <td style={{ padding: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }}>{item.productName}</td>
                                                            <td style={{ padding: '8px', border: '1px solid var(--border-color)', fontWeight: isMatching ? '600' : 'normal' }}>{item.lotNumber}</td>
                                                            <td style={{ padding: '8px', textAlign: 'right', border: '1px solid var(--border-color)', fontWeight: '600', color: isMatching ? '#2e7d32' : 'var(--text-color)' }}>{fmtNum(item.quantity)}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>{item.unit}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>{safeFormatDate(item.expiryDate)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        
                                        {hiddenCount > 0 && (
                                            <button
                                                onClick={() => toggleTicket(imp.id)}
                                                style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '6px', border: '1px solid #4caf50', backgroundColor: 'transparent', color: '#2e7d32', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                                            >
                                                {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                {isExpanded ? 'Thu gọn' : `Xem toàn bộ phiếu (+${hiddenCount} items)`}
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* Modal xem chi tiết phiếu */}
            {modalTicket && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={closeModal}>
                    <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', maxWidth: '900px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)', zIndex: 1 }}>
                            <div style={{ flex: 1 }}>
                                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '600', color: 'var(--text-color)' }}>
                                    {modalType === 'export' ? '📤 Phiếu xuất' : '📥 Phiếu nhập'}: {modalTicket.id}
                                </h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    {modalType === 'export' ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#fff3e0', borderRadius: '6px', border: '1px solid #ffcc80' }}>
                                            <FiUser style={{ fontSize: '14px', color: '#e65100' }} />
                                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#e65100' }}>{modalTicket.customer || modalTicket.customerId}</span>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#e8f5e9', borderRadius: '6px', border: '1px solid #a5d6a7' }}>
                                            <FiTruck style={{ fontSize: '14px', color: '#2e7d32' }} />
                                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#2e7d32' }}>{modalTicket.supplierName || modalTicket.supplierId}</span>
                                        </div>
                                    )}
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        📅 {modalType === 'export' ? safeFormatDate(modalTicket.exportDate) : safeFormatDate(modalTicket.importDate)}
                                    </div>
                                    <div style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: modalTicket.status === 'completed' ? '#e8f5e9' : '#fff3e0', color: modalTicket.status === 'completed' ? '#2e7d32' : '#e65100', border: `1px solid ${modalTicket.status === 'completed' ? '#a5d6a7' : '#ffcc80'}` }}>
                                        {modalTicket.status === 'completed' ? 'Hoàn thành' : modalTicket.status}
                                    </div>
                                </div>
                                {modalTicket.description && (
                                    <div style={{ padding: '10px 14px', backgroundColor: modalType === 'export' ? '#fff9e6' : '#e8f9e8', borderRadius: '6px', border: `1px solid ${modalType === 'export' ? '#ffe0b2' : '#c8e6c9'}`, fontSize: '13px', color: modalType === 'export' ? '#e65100' : '#2e7d32' }}>
                                        <strong>💬 Ghi chú:</strong> {modalTicket.description}
                                    </div>
                                )}
                            </div>
                            <button onClick={closeModal} style={{ padding: '8px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '20px', display: 'flex', alignItems: 'center' }}>
                                <FiX />
                            </button>
                        </div>

                        {/* Body - Items */}
                        <div style={{ padding: '20px' }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: 'var(--text-color)' }}>
                                Danh sách sản phẩm ({modalTicket.items.length} items)
                            </h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: 'var(--table-header-bg, #f8f9fa)' }}>
                                            <th style={{ padding: '10px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Mã hàng</th>
                                            <th style={{ padding: '10px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Tên hàng</th>
                                            <th style={{ padding: '10px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Số lot</th>
                                            <th style={{ padding: '10px', textAlign: 'right', border: '1px solid var(--border-color)', fontWeight: '600' }}>Số lượng</th>
                                            <th style={{ padding: '10px', textAlign: 'center', border: '1px solid var(--border-color)', fontWeight: '600' }}>ĐVT</th>
                                            <th style={{ padding: '10px', textAlign: 'center', border: '1px solid var(--border-color)', fontWeight: '600' }}>HSD</th>
                                            <th style={{ padding: '10px', textAlign: 'left', border: '1px solid var(--border-color)', fontWeight: '600' }}>Ghi chú</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {modalTicket.items.map((item, i) => (
                                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'var(--card-bg)' : 'var(--table-stripe-bg, #fafafa)' }}>
                                                <td style={{ padding: '10px', border: '1px solid var(--border-color)', fontWeight: '600' }}>{item.productId}</td>
                                                <td style={{ padding: '10px', border: '1px solid var(--border-color)' }}>{item.productName}</td>
                                                <td style={{ padding: '10px', border: '1px solid var(--border-color)' }}>{item.lotNumber}</td>
                                                <td style={{ padding: '10px', textAlign: 'right', border: '1px solid var(--border-color)', fontWeight: '600', color: modalType === 'export' ? '#e65100' : '#2e7d32' }}>
                                                    {fmtNum(modalType === 'export' ? item.quantityToExport : item.quantity)}
                                                </td>
                                                <td style={{ padding: '10px', textAlign: 'center', border: '1px solid var(--border-color)' }}>{item.unit}</td>
                                                <td style={{ padding: '10px', textAlign: 'center', border: '1px solid var(--border-color)' }}>{safeFormatDate(item.expiryDate)}</td>
                                                <td style={{ padding: '10px', border: '1px solid var(--border-color)', fontSize: '12px', fontStyle: item.notes ? 'italic' : 'normal', color: item.notes ? 'var(--text-color)' : 'var(--text-secondary)' }}>
                                                    {item.notes || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LotTracePage;
