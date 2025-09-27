// src/pages/ProductLedgerPage.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { getProductLedger } from '../services/dashboardService';
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import Spinner from '../components/Spinner';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import ViewExportSlipModal from '../components/ViewExportSlipModal';
import ProductAutocomplete from '../components/ProductAutocomplete';
import DateRangePresets from '../components/DateRangePresets';
import { FiCalendar, FiPrinter, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const ProductLedgerPage = () => {
    const [productInfo, setProductInfo] = useState(null);
    const [ledgerData, setLedgerData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
    productId: '',
    productName: '', // Sẽ dùng để hiển thị tên sản phẩm đã chọn
    startDate: '',
    endDate: ''
});

const handleSubmit = (e) => {
    e.preventDefault(); // Ngăn trình duyệt tải lại trang
    handleSearch();
};

    // THÊM CÁC STATE VÀ HÀM MỚI DƯỚI ĐÂY
    const [viewModalData, setViewModalData] = useState({ isOpen: false, slip: null, type: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(15); // Số dòng mỗi trang
    const [paginatedRows, setPaginatedRows] = useState([]);

    useEffect(() => {
    if (ledgerData && ledgerData.rows) {
        const startIndex = (currentPage - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        setPaginatedRows(ledgerData.rows.slice(startIndex, endIndex));
    }
}, [ledgerData, currentPage, rowsPerPage]);

    const lineChartData = useMemo(() => {
    if (!ledgerData || !ledgerData.rows || ledgerData.rows.length === 0) return null;

    const dataByDate = ledgerData.rows.reduce((acc, row) => {
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
        datasets: [
            {
                label: 'Số lượng Nhập',
                data: sortedDates.map(date => dataByDate[date].import),
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
            },
            {
                label: 'Số lượng Xuất',
                data: sortedDates.map(date => dataByDate[date].export),
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
            }
        ]
    };
}, [ledgerData]);

    const openViewModal = async (slipId, slipType) => {
    const collectionName = slipType === 'NHẬP' ? 'import_tickets' : 'export_tickets';
    try {
        const docRef = doc(db, collectionName, slipId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            setViewModalData({
                isOpen: true,
                slip: { id: docSnap.id, ...docSnap.data() },
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

const closeViewModal = () => {
    setViewModalData({ isOpen: false, slip: null, type: '' });
};

    const handleSearch = async () => {
    const term = filters.productId.trim();
    if (!term) {
        toast.warn("Vui lòng nhập Mã hàng hoặc Số lô để xem.");
        return;
    }
    setLoading(true);
    setLedgerData(null);
    setProductInfo(null);

    try {
        let foundProductId = null;
        let foundProductData = null;
        let lotNumberToFilter = null; // BIẾN MỚI: Để lưu số lô cần lọc

        // BƯỚC 1: Ưu tiên tìm kiếm theo Số Lô trước.
        const lotQuery = query(collection(db, 'inventory_lots'), where('lotNumber', '==', term), limit(1));
        const lotSnap = await getDocs(lotQuery);

        if (!lotSnap.empty) {
            // Nếu tìm thấy lô -> Lấy productId và lưu lại số lô để lọc
            foundProductId = lotSnap.docs[0].data().productId;
            lotNumberToFilter = term; // <-- LƯU LẠI SỐ LÔ
        } else {
            // Nếu không phải Số Lô, coi như đó là Mã Hàng
            foundProductId = term.toUpperCase();
        }

        // BƯỚC 2: Dựa trên productId đã tìm được, lấy thông tin sản phẩm và thẻ kho
        if (foundProductId) {
            const productRef = doc(db, 'products', foundProductId);
            const productSnap = await getDoc(productRef);

            if (productSnap.exists()) {
                foundProductData = productSnap.data();
                setProductInfo(foundProductData);
                // TRUYỀN THÊM `lotNumberToFilter` VÀO HÀM LẤY DỮ LIỆU
                const data = await getProductLedger(foundProductId, lotNumberToFilter, filters.startDate, filters.endDate);
                setLedgerData(data);
            }
        }

        if (!foundProductData) {
             toast.error(`Không tìm thấy thông tin cho Mã hàng hoặc Số lô: "${term}"`);
        }

    } catch (error) {
        console.error("Lỗi khi lấy sổ chi tiết vật tư:", error);
        toast.error("Đã xảy ra lỗi khi tải dữ liệu.");
    } finally {
        setLoading(false);
    }
};

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    // DÁN TOÀN BỘ KHỐI CODE NÀY ĐỂ THAY THẾ CHO PHẦN `return` CŨ CỦA BẠN

return (
    <div>
        <div className="page-header">
            <h1>Sổ chi tiết Vật tư (Thẻ kho)</h1>
        </div>

        {viewModalData.isOpen && viewModalData.type === 'NHẬP' && (
    <ViewImportSlipModal slip={viewModalData.slip} onClose={closeViewModal} />
)}
{viewModalData.isOpen && viewModalData.type === 'XUẤT' && (
    <ViewExportSlipModal slip={viewModalData.slip} onClose={closeViewModal} />
)}

        <div className="form-section">
            <DateRangePresets onPresetSelect={(startDate, endDate) => {
                setFilters(prev => ({ ...prev, startDate, endDate }));
            }} />
            <div className="form-row">
                <div className="form-group">
                    <label>Từ ngày</label>
                    <div className="date-input-wrapper">
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                        />
                        <FiCalendar className="date-input-icon" />
                    </div>
                </div>
                <div className="form-group">
                    <label>Đến ngày</label>
                    <div className="date-input-wrapper">
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                        />
                        <FiCalendar className="date-input-icon" />
                    </div>
                </div>
            </div>
            <form onSubmit={handleSubmit}>
    <div className="form-row" style={{ marginTop: '15px', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: 2 }}>
            <label>Mã Hàng / Số Lô (*)</label>
            <ProductAutocomplete
                value={filters.productId}
                onSelect={(product) => setFilters(prev => ({ ...prev, productId: product.id, productName: product.productName }))}
                onChange={(value) => setFilters(prev => ({ ...prev, productId: value, productName: '' }))}
            />
        </div>
        <div className="form-group">
            {/* Sửa lại nút bấm: bỏ onClick và thêm type="submit" */}
            <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
                {loading ? 'Đang tải...' : 'Xem Sổ kho'}
            </button>
        </div>
    </div>
</form>
        </div>

        {loading && <Spinner />}

        {ledgerData && productInfo && (
            <>
                <div className="page-header" style={{ marginTop: '30px' }}>
                    <h3>{productInfo.productName} (ĐVT: {productInfo.unit})</h3>
                    <button onClick={() => window.print()} className="btn-secondary">
                        <FiPrinter style={{ marginRight: '5px' }} />
                        In Sổ kho
                    </button>
                </div>

                {lineChartData && (
                    <div className="form-section">
                        <div style={{ height: '300px' }}>
                            <Line
                                data={lineChartData}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'top' },
                                        title: { display: true, text: 'Biến động Nhập-Xuất theo Thời gian' }
                                    }
                                }}
                            />
                        </div>
                    </div>
                )}

                <div className="form-section">
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-card-info"><h4>Tồn đầu kỳ</h4><p>{formatNumber(ledgerData.openingBalance)}</p></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-card-info"><h4>Tổng Nhập</h4><p style={{ color: 'green' }}>+{formatNumber(ledgerData.totalImport)}</p></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-card-info"><h4>Tổng Xuất</h4><p style={{ color: 'red' }}>-{formatNumber(ledgerData.totalExport)}</p></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-card-info"><h4>Tồn cuối kỳ</h4><p style={{ color: 'blue' }}>{formatNumber(ledgerData.closingBalance)}</p></div>
                        </div>
                    </div>
                </div>

                <div className="table-container">
                    <table className="products-table">
                        <thead>
                            <tr>
                                <th>Ngày</th>
                                <th>Chứng từ</th>
                                <th>Loại</th>
                                <th>Diễn giải</th>
                                <th>Số lô</th>
                                <th>HSD</th>
                                <th>Tình trạng HSD</th>
                                <th>Nhập</th>
                                <th>Xuất</th>
                                <th>Tồn</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{fontWeight: 'bold'}}>
                                <td colSpan="9" style={{textAlign: 'right'}}>Tồn đầu kỳ</td>
                                <td>{formatNumber(ledgerData.openingBalance)}</td>
                            </tr>
                            {paginatedRows.map((row, index) => (
                                <tr key={`${row.docId}-${index}`} className={getRowColorByExpiry(row.expiryDateObject)}>
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
                            ))}
                        </tbody>
                    </table>
                    <div className="pagination-controls">
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} 
                            disabled={currentPage === 1}
                        >
                            <FiChevronLeft /> Trang Trước
                        </button>
                        <span>Trang {currentPage} / {Math.ceil((ledgerData?.rows.length || 0) / rowsPerPage)}</span>
                        <button 
                            onClick={() => setCurrentPage(p => p + 1)} 
                            disabled={currentPage * rowsPerPage >= (ledgerData?.rows.length || 0)}
                        >
                            Trang Tiếp <FiChevronRight />
                        </button>
                    </div>
                </div>
            </>
        )}
    </div>
);
};

export default ProductLedgerPage;