// src/pages/SalesAnalyticsPage.jsx
import { Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title } from 'chart.js';
import DateRangePresets from '../components/DateRangePresets';
import React, { useState, useEffect, useMemo } from 'react';
import { getSalesAnalytics } from '../services/dashboardService';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import Spinner from '../components/Spinner';
import { toast } from 'react-toastify';
import { FiCalendar } from 'react-icons/fi';
// THÊM MỚI: Import các hàm của Firestore để lấy danh sách khách hàng
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import CustomerAutocomplete from '../components/CustomerAutocomplete';


// Đăng ký các thành phần của ChartJS
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

const SalesAnalyticsPage = () => {
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        customerId: '', 
        customerName: '',
        productId: ''
    });
    const [results, setResults] = useState([]);
    const [summary, setSummary] = useState({ totalQuantity: 0, totalSlips: 0 });
    const [loading, setLoading] = useState(false);
    
    // THÊM MỚI: State để lưu danh sách khách hàng cho dropdown
    const [allCustomers, setAllCustomers] = useState([]);

    // THÊM MỚI: useEffect để lấy danh sách khách hàng một lần khi component được tải
    useEffect(() => {
        const fetchCustomers = async () => {
            try {
                const q = query(collection(db, "partners"), where("partnerType", "==", "customer"));
                const querySnapshot = await getDocs(q);
                const customerList = querySnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().partnerName }));
                setAllCustomers(customerList);
            } catch (error) {
                console.error("Lỗi khi tải danh sách khách hàng:", error);
                toast.error("Không thể tải danh sách khách hàng.");
            }
        };
        fetchCustomers();
    }, []);

    // THÊM MỚI: Xử lý dữ liệu để tìm top khách hàng và sản phẩm
    const topStats = useMemo(() => {
        if (!results || results.length === 0) return { topCustomers: [], topProducts: [] };

        // Top khách hàng
        const salesByCustomer = results.reduce((acc, row) => {
            acc[row.customer] = (acc[row.customer] || 0) + Number(row.quantityExported);
            return acc;
        }, {});
        const topCustomers = Object.entries(salesByCustomer)
            .sort(([, qtyA], [, qtyB]) => qtyB - qtyA)
            .slice(0, 3)
            .map(([name, quantity]) => ({ name, quantity }));

        // Top sản phẩm
        const salesByProduct = results.reduce((acc, row) => {
            if (!acc[row.productName]) {
                acc[row.productName] = { quantity: 0, unit: row.unit };
            }
            acc[row.productName].quantity += Number(row.quantityExported);
            return acc;
        }, {});
        const topProducts = Object.entries(salesByProduct)
            .sort(([, dataA], [, dataB]) => dataB.quantity - dataA.quantity)
            .slice(0, 3)
            .map(([name, data]) => ({ name, ...data }));

        return { topCustomers, topProducts };
    }, [results]);

    // Xử lý dữ liệu cho biểu đồ đường (giữ nguyên)
    const lineChartData = useMemo(() => {
        if (!results || results.length === 0) return null;
        const salesByDate = results.reduce((acc, row) => {
            const date = formatDate(row.exportDate);
            acc[date] = (acc[date] || 0) + Number(row.quantityExported);
            return acc;
        }, {});
        const sortedDates = Object.keys(salesByDate).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
        return {
            labels: sortedDates,
            datasets: [{
                label: 'Số lượng xuất',
                data: sortedDates.map(date => salesByDate[date]),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
            }],
        };
    }, [results]);

    // Xử lý dữ liệu cho biểu đồ tròn (giữ nguyên)
    const pieChartData = useMemo(() => {
        if (!results || results.length === 0) return null;
        const salesByCustomer = results.reduce((acc, row) => {
            acc[row.customer] = (acc[row.customer] || 0) + Number(row.quantityExported);
            return acc;
        }, {});
        return {
            labels: Object.keys(salesByCustomer),
            datasets: [{
                label: 'Số lượng xuất',
                data: Object.values(salesByCustomer),
                backgroundColor: ['rgba(255, 99, 132, 0.7)','rgba(54, 162, 235, 0.7)','rgba(255, 206, 86, 0.7)','rgba(75, 192, 192, 0.7)','rgba(153, 102, 255, 0.7)','rgba(255, 159, 64, 0.7)',],
            }],
        };
    }, [results]);

    // THÊM MỚI: Tùy chọn để cải thiện giao diện biểu đồ
    const chartOptions = {
        plugins: {
            title: { display: true, font: { size: 16 } },
            legend: { position: 'top' },
        },
        responsive: true,
        maintainAspectRatio: false
    };


    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch(filters);
        }
    };

    const handlePresetSelect = (startDate, endDate) => {
        const newFilters = { ...filters, startDate, endDate };
        setFilters(newFilters);
        handleSearch(newFilters);
    };

    const handleSearch = async (currentFilters = filters) => {
        setLoading(true);
        try {
            const data = await getSalesAnalytics(currentFilters);
            setResults(data);
            const totalQty = data.reduce((sum, item) => sum + Number(item.quantityExported), 0);
            const uniqueSlips = new Set(data.map(item => item.slipId));
            setSummary({ totalQuantity: totalQty, totalSlips: uniqueSlips.size });
        } catch (error) {
            console.error("Lỗi khi lấy dữ liệu phân tích:", error);
            toast.error("Đã xảy ra lỗi khi tải báo cáo.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1>Báo cáo & Phân tích Bán hàng</h1>
            </div>

            <div className="form-section">
                <DateRangePresets onPresetSelect={handlePresetSelect} />
                <div className="form-row">
                    <div className="form-group">
                        <label>Từ ngày</label>
                        <div className="date-input-wrapper">
                            <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                            <FiCalendar className="date-input-icon" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Đến ngày</label>
                        <div className="date-input-wrapper">
                            <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                            <FiCalendar className="date-input-icon" />
                        </div>
                    </div>
                </div>
                {/* THÊM MỚI: Hàng bộ lọc thứ 2 */}
                <div className="form-row" style={{marginTop: '15px'}}>
                    <div className="form-group">
    <label>Khách hàng (Tùy chọn)</label>
    <CustomerAutocomplete
        value={filters.customerName || ''} // Hiển thị tên khách hàng
        onSelect={({ id, name }) => setFilters(prev => ({ ...prev, customerId: id, customerName: name }))}
    />
</div>
                    <div className="form-group">
                        <label>Mã hàng (Tùy chọn)</label>
                        <input type="text" name="productId" placeholder="Nhập mã hàng để lọc..." value={filters.productId} onChange={handleFilterChange} onKeyDown={handleKeyDown}/>
                    </div>
                </div>
                <div className="page-actions" style={{ justifyContent: 'flex-start' }}>
                    <button onClick={() => handleSearch(filters)} className="btn-primary" disabled={loading}>
                        {loading ? 'Đang tải...' : 'Xem Báo cáo'}
                    </button>
                </div>
            </div>

            {loading ? <Spinner /> : (
                <>
                    <div className="stats-grid" style={{ marginBottom: '20px' }}>
                        <div className="stat-card">
                            <div className="stat-card-info"><h4>Tổng số Phiếu xuất</h4><p>{summary.totalSlips}</p></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-card-info"><h4>Tổng số lượng đã xuất</h4><p>{formatNumber(summary.totalQuantity)}</p></div>
                        </div>
                    </div>

                    {/* THÊM MỚI: Hiển thị Top 3 */}
                    {results.length > 0 && (
                         <div className="table-grid" style={{ marginBottom: '20px' }}>
                            <div className="card">
                                <h3>Top 3 Khách hàng</h3>
                                <ul className="recent-activity-list">
                                    {topStats.topCustomers.map(c => <li key={c.name}><span>{c.name}</span><span>{formatNumber(c.quantity)}</span></li>)}
                                </ul>
                            </div>
                            <div className="card">
                                <h3>Top 3 Sản phẩm Bán chạy</h3>
                                <ul className="recent-activity-list">
                                    {topStats.topProducts.map(p => <li key={p.name}><span>{p.name}</span><span>{formatNumber(p.quantity)} {p.unit}</span></li>)}
                                </ul>
                            </div>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="chart-grid" style={{ marginBottom: '20px' }}>
                            {lineChartData && (
                                <div className="card">
                                    <Line key={JSON.stringify(results)} data={lineChartData} options={{...chartOptions, plugins: {...chartOptions.plugins, title: {...chartOptions.plugins.title, text: 'Xu hướng xuất kho theo thời gian'}}}} />
                                </div>
                            )}
                            {pieChartData && (
                                <div className="card">
                                    <Pie key={JSON.stringify(results) + 'pie'} data={pieChartData} options={{...chartOptions, plugins: {...chartOptions.plugins, title: {...chartOptions.plugins.title, text: 'Tỷ trọng xuất kho theo Khách hàng'}}}} />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="table-container">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th>Ngày xuất</th><th>Khách hàng</th><th>Mã hàng</th>
                                    <th>Tên hàng</th><th>Số lô</th><th>Số lượng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.length > 0 ? results.map((row, index) => (
                                    <tr key={`${row.slipId}-${index}`}>
                                        <td>{formatDate(row.exportDate)}</td>
                                        <td style={{textAlign: 'left'}}>{row.customer}</td>
                                        <td>{row.productId}</td>
                                        <td style={{textAlign: 'left'}}>{row.productName}</td>
                                        <td>{row.lotNumber || '(Không có)'}</td>
                                        <td>{formatNumber(row.quantityExported)} {row.unit}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" style={{textAlign: 'center'}}>Không có dữ liệu hoặc vui lòng nhấn "Xem Báo cáo".</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default SalesAnalyticsPage;