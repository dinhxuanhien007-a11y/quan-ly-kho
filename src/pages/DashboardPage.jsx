// src/pages/DashboardPage.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FiArchive, FiAlertTriangle, FiFileText } from 'react-icons/fi';
import Spinner from '../components/Spinner';

// Cập nhật import và đổi tên class CSS
import styles from '../styles/DashboardPage.module.css';

const DashboardCard = ({ icon, tieuDe, giaTri, mauSac }) => (
  <div className={styles.dashboardCard} style={{ borderLeftColor: mauSac }}>
    <div className={styles.cardIcon} style={{ backgroundColor: mauSac }}>{icon}</div>
    <div className={styles.cardInfo}>
      <div className={styles.cardTitle}>{tieuDe}</div>
      <div className={styles.cardValue}>{giaTri}</div>
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
    <div className={styles.dashboardContainer}>
      <h1>Bảng điều khiển</h1>
      <div className={styles.cardsGrid}>
        <DashboardCard icon={<FiArchive />} tieuDe="Tổng số mã hàng" giaTri={thongKe.tongSanPham} mauSac="#007bff" />
        <DashboardCard icon={<FiAlertTriangle />} tieuDe="Sắp hết hạn (30 ngày)" giaTri={thongKe.sapHetHan} mauSac="#ffc107" />
        <DashboardCard icon={<FiFileText />} tieuDe="Phiếu chờ duyệt" giaTri={thongKe.phieuChoDuyet} mauSac="#6c757d" />
      </div>
    </div>
  );
};

export default DashboardPage;