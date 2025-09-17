// src/pages/DashboardPage.jsx
import React, { useState, useEffect } from 'react';
// <-- THAY ĐỔI 1: Import thêm 'onSnapshot'
import { collection, query, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FiArchive, FiAlertTriangle, FiFileText } from 'react-icons/fi';
import Spinner from '../components/Spinner';
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

  // <-- THAY ĐỔI 2: Toàn bộ logic trong useEffect đã được viết lại
  useEffect(() => {
    setLoading(true);

    // Mảng để lưu các hàm unsubscribe
    const unsubscribers = [];
    let initialLoads = 0;
    const totalListeners = 3;

    // Hàm kiểm tra để tắt spinner sau khi tất cả listener đã tải lần đầu
    const checkInitialLoad = () => {
        initialLoads++;
        if (initialLoads === totalListeners) {
            setLoading(false);
        }
    };

    // --- Listener 1: Lắng nghe tổng số sản phẩm ---
    const productsQuery = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      setThongKe(prev => ({ ...prev, tongSanPham: snapshot.size }));
      checkInitialLoad();
    }, (error) => {
        console.error("Lỗi listener sản phẩm:", error);
        checkInitialLoad();
    });
    unsubscribers.push(unsubscribeProducts);

    // --- Listener 2: Lắng nghe số lô sắp hết hạn ---
    const baMuoiNgayToi = new Date();
    baMuoiNgayToi.setDate(baMuoiNgayToi.getDate() + 30);
    const qSapHetHan = query(
      collection(db, 'inventory_lots'),
      where('expiryDate', '<=', Timestamp.fromDate(baMuoiNgayToi)),
      where('expiryDate', '>=', Timestamp.now())
    );
    const unsubscribeNearExpiry = onSnapshot(qSapHetHan, (snapshot) => {
      setThongKe(prev => ({ ...prev, sapHetHan: snapshot.size }));
      checkInitialLoad();
    }, (error) => {
        console.error("Lỗi listener sắp hết hạn:", error);
        checkInitialLoad();
    });
    unsubscribers.push(unsubscribeNearExpiry);

    // --- Listener 3: Lắng nghe số phiếu nhập đang chờ ---
    const qPhieuCho = query(collection(db, 'import_tickets'), where('status', '==', 'pending'));
    const unsubscribePending = onSnapshot(qPhieuCho, (snapshot) => {
      setThongKe(prev => ({ ...prev, phieuChoDuyet: snapshot.size }));
      checkInitialLoad();
    }, (error) => {
        console.error("Lỗi listener phiếu chờ:", error);
        checkInitialLoad();
    });
    unsubscribers.push(unsubscribePending);

    // --- Hàm dọn dẹp ---
    // Khi component bị unmount (rời khỏi trang), hàm này sẽ được gọi
    // để đóng tất cả các kết nối thời gian thực, tránh rò rỉ bộ nhớ.
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []); // Mảng phụ thuộc rỗng, chỉ chạy một lần khi component được mount

  // Phần JSX không có gì thay đổi
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