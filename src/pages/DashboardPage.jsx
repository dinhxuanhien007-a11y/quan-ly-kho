// src/pages/DashboardPage.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FiArchive, FiAlertTriangle, FiFileText } from 'react-icons/fi';
import '../styles/DashboardPage.css';
import Spinner from '../components/Spinner';

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
        const sanPhamSnapshot = await getDocs(collection(db, 'products'));
        const tongSanPham = sanPhamSnapshot.size;
        
        const baMuoiNgayToi = new Date();
        baMuoiNgayToi.setDate(baMuoiNgayToi.getDate() + 30);
        const qSapHetHan = query(
          collection(db, 'inventory_lots'),
          where('expiryDate', '<=', Timestamp.fromDate(baMuoiNgayToi)),
          where('expiryDate', '>=', Timestamp.now())
        );
        const sapHetHanSnapshot = await getDocs(qSapHetHan);
        const sapHetHan = sapHetHanSnapshot.size;

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
    return <Spinner />;
  }

  return (
    <div className="dashboard-container">
      <h1>Bảng điều khiển</h1>
      <div className="cards-grid">
        <DashboardCard icon={<FiArchive />} tieuDe="Tổng số mã hàng" giaTri={thongKe.tongSanPham} mauSac="#007bff" />
        <DashboardCard icon={<FiAlertTriangle />} tieuDe="Sắp hết hạn (30 ngày)" giaTri={thongKe.sapHetHan} mauSac="#ffc107" />
        <DashboardCard icon={<FiFileText />} tieuDe="Phiếu chờ duyệt" giaTri={thongKe.phieuChoDuyet} mauSac="#6c757d" />
      </div>
    </div>
  );
};

export default DashboardPage;