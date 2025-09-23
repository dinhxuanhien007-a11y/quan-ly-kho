// src/pages/DashboardPage.jsx
import React, { useState, useEffect } from 'react';
import { 
    getDashboardStats, 
    getRecentCompletedImports, 
    getRecentCompletedExports, 
    getChartData,
    getPendingImportTickets,
    getPendingExportTickets 
} from '../services/dashboardService';
import StatCard from '../components/StatCard';
import RecentActivityList from '../components/RecentActivityList';
import ExpiryPieChart from '../components/ExpiryPieChart';
import TeamBarChart from '../components/TeamBarChart';
import { FiAlertTriangle, FiCheckCircle, FiPackage, FiUsers } from 'react-icons/fi';
import Spinner from '../components/Spinner';
import '../styles/Dashboard.css';
import { Link } from 'react-router-dom';
import { formatDate } from '../utils/dateUtils';

const DashboardPage = () => {
    const [stats, setStats] = useState({});
    const [recentImports, setRecentImports] = useState([]);
    const [recentExports, setRecentExports] = useState([]);
    const [chartData, setChartData] = useState({ expiryData: {}, teamData: {} });
    const [pendingImports, setPendingImports] = useState([]);
    const [pendingExports, setPendingExports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [
                    statsData, 
                    importsData, 
                    exportsData, 
                    charts, 
                    pendingImportsData, 
                    pendingExportsData
                ] = await Promise.all([
                    getDashboardStats(),
                    getRecentCompletedImports(),
                    getRecentCompletedExports(),
                    getChartData(),
                    getPendingImportTickets(),
                    getPendingExportTickets(),
                ]);
                setStats(statsData);
                setRecentImports(importsData);
                setRecentExports(exportsData);
                setChartData(charts);
                setPendingImports(pendingImportsData);
                setPendingExports(pendingExportsData);
            } catch (error) {
                console.error("Lỗi khi tải dữ liệu dashboard:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const PendingList = ({ title, tickets, type }) => (
        <div className="card">
            <h3>{title} ({tickets.length})</h3>
            {loading ? (
                 <Spinner />
            ) : tickets.length > 0 ? (
                <div className="table-container">
                    <table className="products-table minimal">
                        <thead>
                            <tr>
                                <th>ID Phiếu</th>
                                <th>{type === 'import' ? 'Nhà Cung Cấp' : 'Khách Hàng'}</th>
                                <th>Ngày tạo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tickets.map(ticket => (
                                <tr key={ticket.id}>
                                    <td>
                                        <Link to={`/${type}s`} className="table-link">{ticket.id}</Link>
                                    </td>
                                    <td>{type === 'import' ? ticket.supplierName : ticket.customer}</td>
                                    <td>{formatDate(ticket.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="empty-message">Không có phiếu nào đang chờ xử lý.</p>
            )}
        </div>
    );

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Tổng Quan</h1>
            </div>

            {loading ? <Spinner /> : (
                <div className="dashboard-grid-layout">
                    <div className="stats-grid">
                        <StatCard icon={<FiAlertTriangle />} title="Sắp Hết Hạn" value={stats.nearExpiryCount} isLoading={loading} />
                        <StatCard icon={<FiCheckCircle />} title="Đã Hết Hạn" value={stats.expiredCount} isLoading={loading} />
                        <StatCard icon={<FiPackage />} title="Tổng SKU" value={stats.skuCount} isLoading={loading} />
                        <StatCard icon={<FiUsers />} title="Tổng Đối Tác" value={stats.partnerCount} isLoading={loading} />
                    </div>

                    <div className="chart-grid">
                        <ExpiryPieChart chartData={chartData.expiryData} isLoading={loading} />
                        <TeamBarChart chartData={chartData.teamData} isLoading={loading} />
                    </div>
                    
                    <div className="table-grid">
                        <PendingList title="Phiếu Nhập Chờ Xử Lý" tickets={pendingImports} type="import" />
                        <PendingList title="Phiếu Xuất Chờ Xử Lý" tickets={pendingExports} type="export" />
                    </div>

                    <div className="table-grid">
                        <RecentActivityList title="Phiếu Nhập Vừa Hoàn Tất" items={recentImports} type="import" isLoading={loading} />
                        <RecentActivityList title="Phiếu Xuất Vừa Hoàn Tất" items={recentExports} type="export" isLoading={loading} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardPage;