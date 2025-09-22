// src/components/FloatingToolsModal.jsx
import React, { useState } from 'react';
import FloatingCalculator from './FloatingCalculator'; // Component máy tính cũ
import QuickStockLookup from './QuickStockLookup'; // Component tra cứu mới
import { FiTool, FiSearch, FiX } from 'react-icons/fi';
import styles from './FloatingToolsModal.module.css';

const FloatingToolsModal = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('lookup');

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3>Công cụ nhanh</h3>
          <button className={styles.closeBtn} onClick={onClose}><FiX /></button>
        </div>
        
        <div className={styles.tabsContainer}>
          <button
            className={`${styles.tabButton} ${activeTab === 'lookup' ? styles.active : ''}`}
            onClick={() => setActiveTab('lookup')}
          >
            <FiSearch /> Tra cứu
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'calculator' ? styles.active : ''}`}
            onClick={() => setActiveTab('calculator')}
          >
            <FiTool /> Máy tính
          </button>
        </div>
        
        <div className={styles.modalBody}>
          {activeTab === 'lookup' && <QuickStockLookup />}
          {/* THAY ĐỔI: Gọi FloatingCalculator nhưng không truyền prop onClose để tránh render ra 2 nút đóng */}
          {activeTab === 'calculator' && <FloatingCalculator />}
        </div>
      </div>
    </div>
  );
};

export default FloatingToolsModal;