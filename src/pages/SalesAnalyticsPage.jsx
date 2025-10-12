// src/pages/SalesAnalyticsPage.jsx

import { Line, Pie, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, BarElement } from 'chart.js';
import DateRangePresets from '../components/DateRangePresets';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getSalesAnalytics } from '../services/dashboardService';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import Spinner from '../components/Spinner';
import { toast } from 'react-toastify';
// === BẮT ĐẦU SỬA LỖI TẠI ĐÂY ===
import { FiCalendar, FiArrowUp, FiArrowDown, FiXCircle, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
// === KẾT THÚC SỬA LỖI ===
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import CustomerAutocomplete from '../components/CustomerAutocomplete';
import ProductAutocomplete from '../components/ProductAutocomplete';
import { getElementAtEvent } from 'react-chartjs-2';
import { TEAM_OPTIONS } from '../constants';

// Đăng ký các thành phần của ChartJS
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    BarElement
);

const SalesAnalyticsPage = () => {
    // === CÁC STATE CƠ BẢN ===
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        customerId: '',
        customerName: '',
        productId: '',
    });
    const [results, setResults] = useState([]);
    const [summary, setSummary] = useState({ totalQuantity: 0, totalSlips: 0 });
    const [loading, setLoading] = useState(false);
    const chartRef = useRef();

    const [drillDownFilter, setDrillDownFilter] = useState({ type: null, value: null });
    const [topN, setTopN] = useState(5);
    const [currentPage, setCurrentPage] = useState(1);
    const ROWS_PER_PAGE = 20;

    useEffect(() => {
        const fetchCustomers = async () => {
            try {
                const q = query(collection(db, "partners"), where("partnerType", "==", "customer"));
                const querySnapshot = await getDocs(q);
                // Dòng này không cần thiết vì autocomplete đã tự xử lý
            } catch (error) {
                console.error("Lỗi khi tải danh sách khách hàng:", error);
                toast.error("Không thể tải danh sách khách hàng.");
            }
        };
        fetchCustomers();
    }, []);
    
    const filteredResults = useMemo(() => {
        if (!drillDownFilter.value) {
            return results;
        }
        if (drillDownFilter.type === 'customer') {
            return results.filter(row => row.customer === drillDownFilter.value);
        }
        return results;
    }, [results, drillDownFilter]);

    const topStats = useMemo(() => {
        if (!filteredResults || filteredResults.length === 0) return { topCustomers: [], topProducts: [] };
        
        const salesByCustomer = filteredResults.reduce((acc, row) => {
            acc[row.customer] = (acc[row.customer] || 0) + Number(row.quantityExported);
            return acc;
        }, {});
        const topCustomers = Object.entries(salesByCustomer)
            .sort(([, qtyA], [, qtyB]) => qtyB - qtyA)
            .slice(0, topN)
            .map(([name, quantity]) => ({ name, quantity }));

        const salesByProduct = filteredResults.reduce((acc, row) => {
            if (!acc[row.productName]) {
                acc[row.productName] = { quantity: 0, unit: row.unit };
            }
            acc[row.productName].quantity += Number(row.quantityExported);
            return acc;
        }, {});
        const topProducts = Object.entries(salesByProduct)
            .sort(([, dataA], [, dataB]) => dataB.quantity - dataA.quantity)
            .slice(0, topN)
            .map(([name, data]) => ({ name, ...data }));

        return { topCustomers, topProducts };
    }, [filteredResults, topN]);

    const lineChartData = useMemo(() => {
        if (!filteredResults || filteredResults.length === 0) return null;
        const salesByDate = filteredResults.reduce((acc, row) => {
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
    }, [filteredResults]);

    const pieChartData = useMemo(() => {
        if (!filteredResults || filteredResults.length === 0) return null;
        const salesByCustomer = filteredResults.reduce((acc, row) => {
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
    }, [filteredResults]);

    const chartOptions = {
        plugins: {
            title: { display: true, font: { size: 16 } },
            legend: { position: 'top' },
        },
        responsive: true,
        maintainAspectRatio: false
    };

    const [sortConfig, setSortConfig] = useState({ key: 'exportDate', direction: 'descending' });

    const sortedResults = useMemo(() => {
        let sortableItems = [...filteredResults];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                if (sortConfig.key === 'exportDate') {
                    aValue = a.exportDate.toMillis();
                    bValue = b.exportDate.toMillis();
                }
                
                if (sortConfig.key === 'quantityExported') {
                    aValue = Number(aValue);
                    bValue = Number(bValue);
                }

                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [filteredResults, sortConfig]);

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

    const barChartData = useMemo(() => {
        if (topStats.topProducts.length === 0) return null;
        const reversedTopProducts = [...topStats.topProducts].reverse();
        return {
            labels: reversedTopProducts.map(p => p.name),
            datasets: [{
                label: 'Số lượng đã bán',
                data: reversedTopProducts.map(p => p.quantity),
                backgroundColor: 'rgba(75, 192, 192, 0.7)',
                borderColor: 'rgb(75, 192, 192)',
                borderWidth: 1
            }]
        };
    }, [topStats.topProducts, topN]);

    const barChartOptions = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: `Top ${topN} Sản phẩm Bán chạy`, font: { size: 16 } },
        }
    };

    const paginatedResults = useMemo(() => {
        const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
        return sortedResults.slice(startIndex, startIndex + ROWS_PER_PAGE);
    }, [currentPage, sortedResults]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handlePresetSelect = (startDate, endDate) => {
        const newFilters = { ...filters, startDate, endDate };
        setFilters(newFilters);
        handleSearch(newFilters);
    };

    const handleSearch = async (currentFilters = filters) => {
        setLoading(true);
        setDrillDownFilter({ type: null, value: null });
        setCurrentPage(1);
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
    
    const handleChartClick = (event) => {
        if (!chartRef.current) return;
        const element = getElementAtEvent(chartRef.current, event);
        if (!element.length) return;

        const { index } = element[0];
        const clickedLabel = pieChartData.labels[index];
        
        if (clickedLabel) {
            setDrillDownFilter({ type: 'customer', value: clickedLabel });
            setCurrentPage(1);
            toast.info(`Đã lọc theo khách hàng: ${clickedLabel}`);
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
                <div className="form-row" style={{marginTop: '15px', alignItems: 'flex-end'}}>
                    <div className="form-group" style={{flex: 1.5}}>
                        <label>Khách hàng (Tùy chọn)</label>
                        <CustomerAutocomplete
                            value={filters.customerName || ''}
                            onSelect={({ id, name }) => setFilters(prev => ({ ...prev, customerId: id, customerName: name }))}
                        />
                    </div>
                    <div className="form-group" style={{flex: 1.5}}>
                        <label>Sản phẩm (Tùy chọn)</label>
                        <ProductAutocomplete
    value={filters.productId}
    onSelect={(product) => setFilters(prev => ({ ...prev, productId: product.id }))}
    onChange={(value) => setFilters(prev => ({ ...prev, productId: value }))}
    onEnterPress={() => handleSearch(filters)}
/>
                    </div>
                </div>
                <div className="page-actions" style={{ justifyContent: 'flex-start', marginTop: '15px' }}>
                    <button onClick={() => handleSearch(filters)} className="btn-primary" disabled={loading}>
                        {loading ? 'Đang tải...' : 'Xem Báo cáo'}
                    </button>
                </div>
            </div>

            {loading ? <Spinner /> : (
                <>
                    {drillDownFilter.value && (
                        <div className="inline-warning" style={{justifyContent: 'space-between', marginBottom: '15px', backgroundColor: '#e7f3ff', color: '#004085'}}>
                            <span>
                                <strong>Đang lọc theo {drillDownFilter.type === 'customer' && 'khách hàng'}:</strong> {drillDownFilter.value}
                            </span>
                            <button onClick={() => setDrillDownFilter({ type: null, value: null })} className="btn-icon" title="Bỏ lọc" style={{color: '#004085'}}>
                                <FiXCircle />
                            </button>
                        </div>
                    )}

                    <div className="stats-grid" style={{ marginBottom: '20px' }}>
                        <div className="stat-card">
                            <div className="stat-card-info"><h4>Tổng số Phiếu xuất</h4><p>{summary.totalSlips}</p></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-card-info"><h4>Tổng số lượng đã xuất</h4><p>{formatNumber(summary.totalQuantity)}</p></div>
                        </div>
                    </div>

                    {results.length > 0 && (
                        <div className="table-grid" style={{ marginBottom: '20px' }}>
                            <div className="card">
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                    <h3>Top {topN} Khách hàng</h3>
                                    <select value={topN} onChange={e => setTopN(Number(e.target.value))} style={{padding: '5px', borderColor: '#ccc', borderRadius: '4px'}}>
                                        <option value="3">Top 3</option>
                                        <option value="5">Top 5</option>
                                        <option value="10">Top 10</option>
                                    </select>
                                </div>
                                <ul className="recent-activity-list">
                                    {topStats.topCustomers.map(c => <li key={c.name}><span>{c.name}</span><span>{formatNumber(c.quantity)}</span></li>)}
                                </ul>
                            </div>
                            {barChartData && (
                                <div className="card" style={{height: '300px'}}>
                                    <Bar data={barChartData} options={barChartOptions} />
                                </div>
                            )}
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="chart-grid" style={{ marginBottom: '20px' }}>
                            {lineChartData && (
                                <div className="card" style={{height: '400px'}}>
                                    <Line data={lineChartData} options={{...chartOptions, plugins: {...chartOptions.plugins, title: {...chartOptions.plugins.title, text: 'Xu hướng xuất kho theo thời gian'}}}} />
                                </div>
                            )}
                            {pieChartData && (
                                <div className="card" style={{height: '400px'}}>
                                    <Pie ref={chartRef} data={pieChartData} onClick={handleChartClick} options={{...chartOptions, plugins: {...chartOptions.plugins, title: {...chartOptions.plugins.title, text: 'Tỷ trọng theo Khách hàng (Click để lọc)'}}}} />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="table-container">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th><button onClick={() => requestSort('exportDate')}>Ngày xuất <SortIndicator columnKey="exportDate" /></button></th>
                                    <th><button onClick={() => requestSort('customer')}>Khách hàng <SortIndicator columnKey="customer" /></button></th>
                                    <th><button onClick={() => requestSort('productId')}>Mã hàng <SortIndicator columnKey="productId" /></button></th>
                                    <th><button onClick={() => requestSort('productName')}>Tên hàng <SortIndicator columnKey="productName" /></button></th>
                                    <th><button onClick={() => requestSort('lotNumber')}>Số lô <SortIndicator columnKey="lotNumber" /></button></th>
                                    <th><button onClick={() => requestSort('quantityExported')}>Số lượng <SortIndicator columnKey="quantityExported" /></button></th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedResults.length > 0 ? paginatedResults.map((row, index) => (
                                    <tr key={`${row.slipId}-${index}`}>
                                        <td>{formatDate(row.exportDate)}</td>
                                        <td style={{textAlign: 'left'}}>{row.customer}</td>
                                        <td>{row.productId}</td>
                                        <td style={{textAlign: 'left'}}>{row.productName}</td>
                                        <td>{row.lotNumber || '(Không có)'}</td>
                                        <td style={{fontWeight: 'bold'}}>{formatNumber(row.quantityExported)} {row.unit}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" style={{textAlign: 'center'}}>
                                            {results.length > 0 ? 'Không có dữ liệu cho trang này.' : 'Không có dữ liệu hoặc vui lòng nhấn "Xem Báo cáo".'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {sortedResults.length > ROWS_PER_PAGE && (
                        <div className="pagination-controls">
                            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>
                                <FiChevronLeft /> Trang Trước
                            </button>
                            <span>Trang {currentPage} / {Math.ceil(sortedResults.length / ROWS_PER_PAGE)}</span>
                            <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage * ROWS_PER_PAGE >= sortedResults.length}>
                                Trang Tiếp <FiChevronRight />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default SalesAnalyticsPage;
