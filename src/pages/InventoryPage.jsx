// src/pages/InventoryPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query } from 'firebase/firestore';
import InventoryFilters from '../components/InventoryFilters'; // Import component bộ lọc

// Thêm hàm này vào đầu file InventoryPage.jsx
const formatDate = (timestamp) => {
  if (!timestamp || !timestamp.toDate) return '';
  const date = timestamp.toDate();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Tháng bắt đầu từ 0
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const InventoryPage = ({ user, userRole }) => {
  const [masterInventory, setMasterInventory] = useState([]); // Danh sách gốc
  const [filteredInventory, setFilteredInventory] = useState([]); // Danh sách đã lọc để hiển thị
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ team: 'all', dateStatus: 'all' });
  const [selectedRowId, setSelectedRowId] = useState(null);

  useEffect(() => {
    const fetchAndFilterInventory = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "inventory_lots"));
        const querySnapshot = await getDocs(q);
        const allInventory = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        let roleBasedInventory = [];
        if (userRole === 'med') {
          roleBasedInventory = allInventory.filter(item => item.team === 'MED');
        } else if (userRole === 'bio') {
          roleBasedInventory = allInventory.filter(item => item.team === 'BIO' || item.team === 'Spare Part');
        } else {
          roleBasedInventory = allInventory;
        }

        setMasterInventory(roleBasedInventory);

      } catch (error) {
        console.error("Lỗi khi lấy dữ liệu tồn kho: ", error);
      } finally {
        setLoading(false);
      }
    };

    if (userRole) {
        fetchAndFilterInventory();
    }
  }, [userRole]);

  useEffect(() => {
    let result = [...masterInventory];

    if (filters.team !== 'all') {
      result = result.filter(item => item.team === filters.team);
    }

    if (filters.dateStatus !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (filters.dateStatus === 'expired') {
        result = result.filter(item => item.expiryDate?.toDate() < today);
      }
      
      if (filters.dateStatus === 'near_expiry') {
        const nearExpiryLimit = new Date();
        nearExpiryLimit.setDate(today.getDate() + 120);
        result = result.filter(item => {
          const expiryDate = item.expiryDate?.toDate();
          return expiryDate >= today && expiryDate < nearExpiryLimit;
        });
      }
    }
    
    result.sort((a, b) => (b.importDate?.toDate() || 0) - (a.importDate?.toDate() || 0));

    setFilteredInventory(result);
  }, [filters, masterInventory]);

  const handleFilterChange = (filterName, value) => {
    setFilters(prevFilters => ({
      ...prevFilters,
      [filterName]: value,
    }));
  };

  const handleRowClick = (lotId) => {
  // Nếu click vào dòng đang được chọn thì bỏ chọn
  if (selectedRowId === lotId) {
    setSelectedRowId(null);
  } else {
    // Ngược lại, chọn dòng mới
    setSelectedRowId(lotId);
  }
};
  
  // Hàm để lấy tiêu đề động
  const getTitleByRole = (role) => {
    switch (role) {
      case 'med':
        return 'Sổ Cái Tồn Kho (Team Med)';
      case 'bio':
        return 'Sổ Cái Tồn Kho (Team Bio)';
      case 'admin':
        return 'Sổ Cái Tồn Kho (Admin)';
      case 'owner':
        return 'Sổ Cái Tồn Kho (Owner)';
      default:
        return 'Sổ Cái Tồn Kho';
    }
  };

  if (loading) {
    return <div>Đang tải dữ liệu tồn kho...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>{getTitleByRole(userRole)}</h1>
      </div>

      <InventoryFilters 
        userRole={userRole} 
        onFilterChange={handleFilterChange} 
        activeFilters={filters}
      />

      <div className="table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Ngày nhập hàng</th>
              <th>Mã hàng</th>
              <th>Tên hàng</th>
              <th>Số lô</th>
              <th>HSD</th>
              <th>ĐVT</th>
              <th>Quy cách</th>
              <th>SL Nhập</th>
              <th>SL Còn lại</th>
              <th>Ghi chú</th>
              <th>Nhiệt độ BQ</th>
              <th>Hãng SX</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
  {filteredInventory.length > 0 ? (
    filteredInventory.map(lot => (
      <tr 
        key={lot.id}
        onClick={() => handleRowClick(lot.id)}
        className={selectedRowId === lot.id ? 'selected-row' : ''}
      >
        <td>{formatDate(lot.importDate)}</td>
        <td>{lot.productId}</td>
        <td>{lot.productName}</td>
        <td>{lot.lotNumber}</td>
        <td>{formatDate(lot.expiryDate)}</td>
        <td>{lot.unit}</td>
        <td>{lot.packaging}</td>
        <td>{lot.quantityImported}</td>
        <td>{lot.quantityRemaining}</td>
        <td>{lot.notes}</td>
        <td>{lot.storageTemp}</td>
        <td>{lot.manufacturer}</td>
        <td>{lot.team}</td>
      </tr>
    ))
  ) : (
    <tr>
      <td colSpan="13" style={{ textAlign: 'center' }}>Không có dữ liệu tồn kho phù hợp.</td>
    </tr>
  )}
</tbody>
        </table>
      </div>
    </div>
  );
};

export default InventoryPage;