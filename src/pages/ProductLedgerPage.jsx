// src/pages/ProductLedgerPage.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import Spinner from '../components/Spinner';
import { toast } from 'react-toastify';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import ViewExportSlipModal from '../components/ViewExportSlipModal';
import ProductAutocomplete from '../components/ProductAutocomplete';
import DateRangePresets from '../components/DateRangePresets';
import { FiCalendar, FiPrinter, FiChevronLeft, FiChevronRight, FiRefreshCw, FiInfo, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { exportLedgerToPDF } from '../utils/pdfUtils';
import { useProductLedger } from '../hooks/useProductLedger'; // NÂNG CẤP 5: Import hook mới
import PartnerAutocomplete from '../components/PartnerAutocomplete';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const ProductLedgerPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // NÂNG CẤP 5: Sử dụng custom hook để quản lý logic dữ liệu
    const { productInfo, ledgerData, loading, lotNumberFilter, search, clear } = useProductLedger();

    // Các state liên quan đến UI được giữ lại trong component
    const [viewMode, setViewMode] = useState('transactions'); // NÂNG CẤP 4: State cho chế độ xem
    const [filters, setFilters] = useState({
        productId: searchParams.get('productId') || '',
        productName: searchParams.get('productName') || '',
        startDate: searchParams.get('startDate') || '',
        endDate: searchParams.get('endDate') || '',
        transactionType: searchParams.get('transactionType') || 'all',
        partnerName: searchParams.get('partnerName') || '', // NÂNG CẤP 2
    });

    const [viewModalData, setViewModalData] = useState({ isOpen: false, slip: null, type: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [paginatedRows, setPaginatedRows] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'ascending' });

    // Đồng bộ state của bộ lọc vào URL
    useEffect(() => {
        const newSearchParams = {};
        if (filters.productId) newSearchParams.productId = filters.productId;
        if (filters.productName) newSearchParams.productName = filters.productName;
        if (filters.startDate) newSearchParams.startDate = filters.startDate;
        if (filters.endDate) newSearchParams.endDate = filters.endDate;
        if (filters.transactionType !== 'all') newSearchParams.transactionType = filters.transactionType;
        if (lotNumberFilter) newSearchParams.lotNumber = lotNumberFilter;
        if (filters.partnerName) newSearchParams.partnerName = filters.partnerName;
        
        setSearchParams(newSearchParams, { replace: true });
    }, [filters, lotNumberFilter, setSearchParams]);

    // Tự động tìm kiếm khi tải trang nếu URL có tham số
    useEffect(() => {
        if (filters.productId) {
            search(filters);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    const handleClearFilters = () => {
        setFilters({
            productId: '',
            productName: '',
            startDate: '',
            endDate: '',
            transactionType: 'all',
            partnerName: ''
        });
        setCurrentPage(1);
        clear(); // Gọi hàm clear từ hook
    };

    const sortedRows = useMemo(() => {
        if (!ledgerData || !ledgerData.rows) return [];
        
        const filteredItems = ledgerData.rows.filter(row => {
            if (filters.transactionType === 'all') return true;
            return row.type.toUpperCase() === filters.transactionType.toUpperCase();
        });

        let sortableItems = [...filteredItems];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];
                if (sortConfig.key === 'date') {
                    const aIsValid = aValue instanceof Date && !isNaN(aValue);
                    const bIsValid = bValue instanceof Date && !isNaN(bValue);
                    if (!aIsValid) return 1;
                    if (!bIsValid) return -1;
                    aValue = aValue.getTime();
                    bValue = bValue.getTime();
                }
                if (aValue == null || aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (bValue == null || aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [ledgerData, sortConfig, filters.transactionType]);

    // NÂNG CẤP 4: Logic tổng hợp theo lô
    const lotSummaryData = useMemo(() => {
    if (!ledgerData || !ledgerData.rows) return [];

    const lots = {};

    // 1. Gom nhóm tất cả giao dịch theo từng lô
    ledgerData.rows.forEach(row => {
        const lotKey = row.lotNumber || 'KHONG_CO_LO';
        if (!lots[lotKey]) {
            lots[lotKey] = {
                lotNumber: row.lotNumber || '(Không có)',
                expiryDate: row.expiryDate,
                expiryDateObject: row.expiryDateObject,
                transactions: []
            };
        }
        lots[lotKey].transactions.push(row);
    });

    // 2. Tính toán lại cho mỗi lô với công thức logic ĐÚNG
    return Object.values(lots).map(lot => {
        let lotOpeningBalance = 0;
        let lotTotalImport = 0;
        let lotTotalExport = 0;

        lot.transactions.forEach(tx => {
            // Kiểm tra xem đây có phải là giao dịch "Tồn đầu kỳ" không
            if (tx.description && tx.description.toLowerCase().includes('tồn đầu kỳ')) {
                lotOpeningBalance += tx.importQty;
            } 
            // Nếu không, phân loại vào Nhập hoặc Xuất thông thường
            else {
                if (tx.type === 'NHẬP') {
                    lotTotalImport += tx.importQty;
                } else if (tx.type === 'XUẤT') {
                    lotTotalExport += tx.exportQty;
                }
            }
        });
        
        // Tồn cuối kỳ = Tồn đầu + Nhập trong kỳ - Xuất trong kỳ
        const lotClosingBalance = lotOpeningBalance + lotTotalImport - lotTotalExport;

        return {
            ...lot,
            openingBalance: lotOpeningBalance,
            totalImport: lotTotalImport,
            totalExport: lotTotalExport,
            closingBalance: lotClosingBalance,
        };
    }).sort((a, b) => { // Sắp xếp theo HSD
        if (!a.expiryDateObject) return 1;
        if (!b.expiryDateObject) return -1;
        return a.expiryDateObject - b.expiryDateObject;
    });

}, [ledgerData]);

    const handleExportPDF = async () => {
        if (!productInfo || !ledgerData || !sortedRows) {
            toast.error("Không có dữ liệu để xuất file PDF.");
            return;
        }
        toast.info("Đang tạo file PDF...");
        try {
            await exportLedgerToPDF(productInfo, ledgerData, sortedRows, filters);
        } catch (error) {
            console.error("Lỗi khi xuất PDF:", error);
            toast.error("Đã xảy ra lỗi khi tạo file PDF.");
        }
    };

    useEffect(() => {
        if (sortedRows) {
            const startIndex = (currentPage - 1) * rowsPerPage;
            const endIndex = startIndex + rowsPerPage;
            setPaginatedRows(sortedRows.slice(startIndex, endIndex));
        }
    }, [sortedRows, currentPage, rowsPerPage]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
        setCurrentPage(1);
    };

    const SortIndicator = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return null;
        return sortConfig.direction === 'ascending' ? <FiArrowUp /> : <FiArrowDown />;
    };

    const lineChartData = useMemo(() => {
        if (!sortedRows || sortedRows.length === 0) return null;
        const dataByDate = sortedRows.reduce((acc, row) => {
            const date = formatDate(row.date);
            if (!acc[date]) {
                acc[date] = { import: 0, export: 0 };
            }
            acc[date].import += row.importQty;
            acc[date].export += row.exportQty;
            return acc;
        }, {});
        const sortedDates = Object.keys(dataByDate).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
        return {
            labels: sortedDates,
            datasets: [{
                label: 'Số lượng Nhập', data: sortedDates.map(date => dataByDate[date].import),
                borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgba(54, 162, 235, 0.5)',
            }, {
                label: 'Số lượng Xuất', data: sortedDates.map(date => dataByDate[date].export),
                borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.5)',
            }]
        };
    }, [sortedRows]);

    const openViewModal = async (slipId, slipType) => {
        const collectionName = slipType === 'NHẬP' ? 'import_tickets' : 'export_tickets';
        try {
            const docRef = doc(db, collectionName, slipId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                 const slipData = { id: docSnap.id, ...docSnap.data() };

                // --- BẮT ĐẦU LÀM GIÀU DỮ LIỆU ---
                // 1. Lấy thông tin chi tiết của tất cả sản phẩm trong phiếu
                const productPromises = slipData.items.map(item => getDoc(doc(db, 'products', item.productId)));
                const productSnapshots = await Promise.all(productPromises);
                
                const productDetailsMap = productSnapshots.reduce((acc, docSn) => {
                    if (docSn.exists()) {
                        acc[docSn.id] = docSn.data();
                    }
                    return acc;
                }, {});

                // 2. Gộp thông tin chi tiết vào từng sản phẩm trong phiếu
                const enrichedItems = slipData.items.map(item => {
                    const details = productDetailsMap[item.productId] || {};
                    return {
                        ...item,
                        unit: details.unit || '',
                        specification: details.packaging || '',
                        storageTemp: details.storageTemp || '',
                    };
                });

                const enrichedSlip = { ...slipData, items: enrichedItems };
                // --- KẾT THÚC LÀM GIÀU DỮ LIỆU ---
                setViewModalData({
                    isOpen: true,
                    slip: enrichedSlip, // <-- Sử dụng dữ liệu đã được làm giàu
                    type: slipType
                });
            } else {
                toast.error("Không tìm thấy chi tiết của phiếu này.");
            }
        } catch (error) {
            toast.error("Lỗi khi tải chi tiết phiếu.");
            console.error(error);
        }
    };

    const closeViewModal = () => setViewModalData({ isOpen: false, slip: null, type: '' });

    const handleSubmit = (e) => {
        e.preventDefault();
        search(filters);
    };

    return (
        <div>
            <div className="page-header">
                <h1>Sổ chi tiết Vật tư (Thẻ kho)</h1>
            </div>

            <div className="view-toggle" style={{ marginBottom: '20px' }}>
                <button onClick={() => setViewMode('transactions')} className={viewMode === 'transactions' ? 'btn-primary' : 'btn-secondary'} style={{width: 'auto'}}>
                    Xem Chi tiết Giao dịch
                </button>
                <button onClick={() => setViewMode('lotSummary')} className={viewMode === 'lotSummary' ? 'btn-primary' : 'btn-secondary'} style={{width: 'auto'}}>
                    Xem Tổng hợp theo Lô
                </button>
            </div>

            {viewModalData.isOpen && viewModalData.type === 'NHẬP' && <ViewImportSlipModal slip={viewModalData.slip} onClose={closeViewModal} />}
            {viewModalData.isOpen && viewModalData.type === 'XUẤT' && <ViewExportSlipModal slip={viewModalData.slip} onClose={closeViewModal} />}

            <div className="form-section">
                <div className="filter-group" style={{ marginBottom: '15px' }}>
                    <button className={filters.transactionType === 'all' ? 'active' : ''} onClick={() => setFilters(prev => ({...prev, transactionType: 'all'}))}>Tất cả</button>
                    <button className={filters.transactionType === 'NHẬP' ? 'active' : ''} onClick={() => setFilters(prev => ({...prev, transactionType: 'NHẬP'}))}>Chỉ xem Nhập</button>
                    <button className={filters.transactionType === 'XUẤT' ? 'active' : ''} onClick={() => setFilters(prev => ({...prev, transactionType: 'XUẤT'}))}>Chỉ xem Xuất</button>
                </div>
                <DateRangePresets onPresetSelect={(startDate, endDate) => setFilters(prev => ({ ...prev, startDate, endDate }))} />
                <div className="form-row">
                    <div className="form-group">
                        <label>Từ ngày</label>
                        <div className="date-input-wrapper">
                            <input type="date" value={filters.startDate} onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))} />
                            <FiCalendar className="date-input-icon" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Đến ngày</label>
                        <div className="date-input-wrapper">
                            <input type="date" value={filters.endDate} onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))} />
                            <FiCalendar className="date-input-icon" />
                        </div>
                    </div>
                </div>
                <div className="form-row" style={{marginTop: '15px'}}>
    <div className="form-group">
        <label>Đối tác (Tùy chọn)</label>
        <PartnerAutocomplete
            value={filters.partnerName}
            onSelect={(partnerName) => {
                setFilters(prev => ({ ...prev, partnerName: partnerName }));
            }}
        />
    </div>
</div>
                <form onSubmit={handleSubmit}>
                    <div className="form-row" style={{ marginTop: '15px', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: 2 }}>
                            <label>Mã Hàng / Số Lô (*)</label>
                            <ProductAutocomplete
                                value={filters.productId}
                                onSelect={(product) => {
                                    const newFilters = { ...filters, productId: product.id, productName: product.productName };
                                    setFilters(newFilters);
                                    search(newFilters);
                                }}
                                onChange={(value) => setFilters(prev => ({ ...prev, productId: value, productName: '' }))}
                            />
                        </div>
                        <div className="form-group">
                            <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
                                {loading ? 'Đang tải...' : 'Xem Sổ kho'}
                            </button>
                        </div>
                        <div className="form-group">
                            <button type="button" className="btn-secondary" onClick={handleClearFilters} title="Xóa bộ lọc" style={{ width: 'auto', padding: '10px' }}>
                                <FiRefreshCw />
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {loading && <Spinner />}

            {!loading && !ledgerData && productInfo === null && (
                <div className="empty-state-container">
                    <FiInfo />
                    <h4>Chưa có dữ liệu</h4>
                    <p>Hãy chọn sản phẩm và khoảng thời gian để xem sổ chi tiết.</p>
                </div>
            )}

            {!loading && ledgerData && ledgerData.rows.length === 0 && (
                <div className="empty-state-container">
                    <FiInfo />
                    <h4>Không tìm thấy giao dịch</h4>
                    <p>Không có giao dịch nào cho sản phẩm này trong khoảng thời gian đã chọn.</p>
                </div>
            )}

            {ledgerData && productInfo && ledgerData.rows.length > 0 && (
                <>
                    <div className="page-header" style={{ marginTop: '30px' }}>
                        <div>
                            <h3>{productInfo.productName} (ĐVT: {productInfo.unit})</h3>
                            {lotNumberFilter && <p style={{ margin: 0, color: '#007bff' }}>Đang xem chi tiết cho Lô: <strong>{lotNumberFilter}</strong></p>}
                        </div>
                        <button onClick={handleExportPDF} className="btn-primary">
                            <FiPrinter style={{marginRight: '5px'}} /> Xuất PDF
                        </button>
                    </div> 
                    
                    {lineChartData && (
                        <div className="form-section">
                            <div style={{ height: '300px' }}>
                                <Line data={lineChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Biến động Nhập-Xuất theo Thời gian' }}}} />
                            </div>
                        </div>
                    )}

                    <div className="form-section ledger-summary-sticky">
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-card-info"><h4>Tồn đầu kỳ {lotNumberFilter && '(của lô)'}</h4><p>{formatNumber(ledgerData.openingBalance)}</p></div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-card-info"><h4>Tổng Nhập {lotNumberFilter && '(của lô)'}</h4><p style={{ color: 'green' }}>+{formatNumber(ledgerData.totalImport)}</p></div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-card-info"><h4>Tổng Xuất {lotNumberFilter && '(của lô)'}</h4><p style={{ color: 'red' }}>-{formatNumber(ledgerData.totalExport)}</p></div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-card-info"><h4>Tồn cuối kỳ {lotNumberFilter && '(của lô)'}</h4><p style={{ color: 'blue' }}>{formatNumber(ledgerData.closingBalance)}</p></div>
                            </div>
                        </div>
                    </div>

                    {viewMode === 'transactions' ? (
                        <>
                            <div className="table-container">
                                <table className="products-table">
                                    <thead>
                                        <tr>
                                            <th><button onClick={() => requestSort('date')}>Ngày <SortIndicator columnKey="date" /></button></th>
                                            <th>Chứng từ</th>
                                            <th>Loại</th>
                                            <th>Diễn giải</th>
                                            <th>Số lô</th>
                                            <th>HSD</th>
                                            <th>Tình trạng HSD</th>
                                            <th><button onClick={() => requestSort('importQty')}>Nhập <SortIndicator columnKey="importQty" /></button></th>
                                            <th><button onClick={() => requestSort('exportQty')}>Xuất <SortIndicator columnKey="exportQty" /></button></th>
                                            <th><button onClick={() => requestSort('balance')}>Tồn <SortIndicator columnKey="balance" /></button></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style={{ fontWeight: 'bold' }}>
                                            <td colSpan="9" style={{ textAlign: 'right' }}>Tồn đầu kỳ</td>
                                            <td>{formatNumber(ledgerData.openingBalance)}</td>
                                        </tr>
                                        {paginatedRows.map((row, index) => {
                                            const isSearchedLot = lotNumberFilter && row.lotNumber === lotNumberFilter;
                                            const expiryClass = getRowColorByExpiry(row.expiryDateObject);
                                            const isLatestTransaction = sortedRows.length > 0 && row === sortedRows[sortedRows.length - 1];
                                            const rowClassName = `${expiryClass} ${isSearchedLot ? 'searched-lot-highlight' : ''} ${isLatestTransaction ? 'latest-transaction-highlight' : ''}`.trim();

                                            return (
                                                <tr key={`${row.docId}-${row.lotNumber}-${index}`} className={rowClassName}>
                                                    <td>{formatDate(row.date)}</td>
                                                    <td>
                                                        {row.isTicket ? (<button onClick={() => openViewModal(row.docId, row.type)} className="btn-link table-link" title="Xem chi tiết phiếu">{row.docId}</button>) : (<span title="Bản ghi tồn kho gốc, không có phiếu chi tiết">{row.docId}</span>)}
                                                    </td>
                                                    <td>{row.type}</td>
                                                    <td style={{ textAlign: 'left' }}>{row.description}</td>
                                                    <td>{row.lotNumber || '(Không có)'}</td>
                                                    <td>{row.expiryDate || '(Không có)'}</td>
                                                    <td>
                                                        {row.expiryDateObject ? (getRowColorByExpiry(row.expiryDateObject).replace('near-expiry-red', 'Cận Date').replace('near-expiry-orange', 'Cận Date').replace('near-expiry-yellow', 'Cận Date').replace('expired-black', 'Hết Hạn') || 'An toàn') : '(N/A)'}
                                                    </td>
                                                    <td style={{ color: 'green' }}>{row.importQty > 0 ? formatNumber(row.importQty) : ''}</td>
                                                    <td style={{ color: 'red' }}>{row.exportQty > 0 ? formatNumber(row.exportQty) : ''}</td>
                                                    <td style={{ fontWeight: 'bold' }}>{formatNumber(row.balance)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="pagination-controls">
                                <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>
                                    <FiChevronLeft /> Trang Trước
                                </button>
                                <span>Trang {currentPage} / {Math.ceil((sortedRows.length || 0) / rowsPerPage)}</span>
                                <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage * rowsPerPage >= (sortedRows.length || 0)}>
                                    Trang Tiếp <FiChevronRight />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="table-container">
                            <table className="products-table">
                                <thead>
                                    <tr>
                                        <th>Số lô</th>
                                        <th>HSD</th>
                                        <th>Tồn đầu kỳ</th>
                                        <th>Tổng Nhập</th>
                                        <th>Tổng Xuất</th>
                                        <th>Tồn cuối kỳ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lotSummaryData.map(lot => {
                                        const expiryClass = getRowColorByExpiry(lot.expiryDateObject);
                                        return (
                                            <tr key={lot.lotNumber} className={expiryClass}>
                                                <td>{lot.lotNumber}</td>
                                                <td>{lot.expiryDate || '(Không có)'}</td>
                                                <td>{formatNumber(lot.openingBalance)}</td>
                                                <td style={{ color: 'green' }}>{lot.totalImport > 0 ? `+${formatNumber(lot.totalImport)}` : '0'}</td>
                                                <td style={{ color: 'red' }}>{lot.totalExport > 0 ? `-${formatNumber(lot.totalExport)}` : '0'}</td>
                                                <td style={{ fontWeight: 'bold' }}>{formatNumber(lot.closingBalance)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ProductLedgerPage;