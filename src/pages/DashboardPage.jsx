import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPendingImportTickets, getPendingExportTickets } from '../services/dashboardService';
import Spinner from '../components/Spinner';
import { formatDate } from '../utils/dateUtils';
import '../styles/Dashboard.css'; // Sử dụng lại file CSS cũ

const DashboardPage = () => {
    const [pendingImports, setPendingImports] = useState([]);
    const [pendingExports, setPendingExports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // Gọi song song hai hàm để tăng tốc độ tải
                const [imports, exports] = await Promise.all([
                    getPendingImportTickets(),
                    getPendingExportTickets()
                ]);
                setPendingImports(imports);
                setPendingExports(exports);
            } catch (error) {
                console.error("Lỗi khi tải danh sách phiếu chờ xử lý:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return <Spinner />;
    }

    // Component để render một danh sách phiếu
    const TicketList = ({ title, tickets, type }) => (
        <div className="card">
            <h3>{title} ({tickets.length})</h3>
            {tickets.length > 0 ? (
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
                                        {/* Link dẫn đến trang danh sách phiếu tương ứng */}
                                        <Link to={`/${type}s`} className="table-link">{ticket.id}</Link>
                                    </td>
                                    <td>{type === 'import' ? ticket.supplier : ticket.customer}</td>
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
                <h1>Cần xử lý</h1>
            </div>

            <div className="dashboard-grid single-column-grid">
                {/* Danh sách phiếu nhập */}
                <TicketList title="Phiếu Nhập Chờ Xử Lý" tickets={pendingImports} type="import" />

                {/* Danh sách phiếu xuất */}
                <TicketList title="Phiếu Xuất Chờ Xử Lý" tickets={pendingExports} type="export" />
            </div>
        </div>
    );
};

export default DashboardPage;