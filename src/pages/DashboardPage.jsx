// src/pages/DashboardPage.jsx

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FiArchive, FiAlertTriangle, FiFileText } from 'react-icons/fi';
import '../styles/DashboardPage.css'; // File CSS riêng cho trang Dashboard

// Component tái sử dụng để hiển thị các thẻ thông số
const DashboardCard = ({ icon, tieuDe, giaTri, mauSac }) => (
  <div className="dashboard-card" style={{ borderLeftColor: mauSac }}>
    <div className="card-icon" style={{ backgroundColor: mauSac }}>{icon}</div>
    <div className="card-info">
      <div className="card-title">{tieuDe}</div>
      <div className="card-value">{giaTri}</div>
    </div>
  </div>
);

const DashboardPage = () => {
  const [thongKe, setThongKe] = useState({
    tongSanPham: 0,
    sapHetHan: 0,
    phieuChoDuyet: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const layDuLieuDashboard = async () => {
      setLoading(true);
      try {
        // 1. Lấy tổng số mã sản phẩm
        const sanPhamSnapshot = await getDocs(collection(db, 'products'));
        const tongSanPham = sanPhamSnapshot.size;

        // 2. Lấy số lô hàng sắp hết hạn (trong vòng 30 ngày tới)
        const baMuoiNgayToi = new Date();
        baMuoiNgayToi.setDate(baMuoiNgayToi.getDate() + 30);
        const qSapHetHan = query(
          collection(db, 'inventory_lots'),
          where('expiryDate', '<=', Timestamp.fromDate(baMuoiNgayToi)),
          where('expiryDate', '>=', Timestamp.now()) // Thêm điều kiện để không đếm hàng đã hết hạn
        );
        const sapHetHanSnapshot = await getDocs(qSapHetHan);
        const sapHetHan = sapHetHanSnapshot.size;

        // 3. Lấy số phiếu nhập đang ở trạng thái "chờ"
        const qPhieuCho = query(collection(db, 'import_tickets'), where('status', '==', 'pending'));
        const phieuChoSnapshot = await getDocs(qPhieuCho);
        const phieuChoDuyet = phieuChoSnapshot.size;

        setThongKe({ tongSanPham, sapHetHan, phieuChoDuyet });
      } catch (error) {
        console.error("Lỗi khi lấy dữ liệu dashboard: ", error);
      } finally {
        setLoading(false);
      }
    };

    layDuLieuDashboard();
  }, []);

  if (loading) {
    return <div>Đang tải bảng điều khiển...</div>;
  }

  return (
    <div className="dashboard-container">
      <h1>Bảng điều khiển</h1>
      <div className="cards-grid">
        <DashboardCard
          icon={<FiArchive />}
          tieuDe="Tổng số mã hàng"
          giaTri={thongKe.tongSanPham}
          mauSac="#007bff"
        />
        <DashboardCard
          icon={<FiAlertTriangle />}
          tieuDe="Sắp hết hạn (30 ngày)"
          giaTri={thongKe.sapHetHan}
          mauSac="#ffc107"
        />
        <DashboardCard
          icon={<FiFileText />}
          tieuDe="Phiếu chờ duyệt"
          giaTri={thongKe.phieuChoDuyet}
          mauSac="#6c757d"
        />
      </div>
    </div>
  );
};

export default DashboardPage;