// src/pages/InventoryPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';

const InventoryPage = ({ user, userRole }) => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInventory = async () => {
      setLoading(true);
      try {
        const inventoryCollection = collection(db, "inventory_lots");
        let q;

        if (userRole === 'med') {
          q = query(inventoryCollection, where("team", "==", "MED"));
        } else if (userRole === 'bio') {
          q = query(inventoryCollection, where("team", "in", ["BIO", "Spare Part"]));
        } else { // admin, owner
          q = query(inventoryCollection);
        }
        
        const querySnapshot = await getDocs(q);
        const inventoryList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Sắp xếp dữ liệu bằng JavaScript sau khi đã lấy về
        inventoryList.sort((a, b) => {
          const dateA = a.importDate?.toDate() || 0;
          const dateB = b.importDate?.toDate() || 0;
          return dateB - dateA;
        });

        setInventory(inventoryList);
      } catch (error) {
        console.error("Lỗi khi lấy dữ liệu tồn kho: ", error);
      } finally {
        setLoading(false);
      }
    };

    if (userRole) {
        fetchInventory();
    }
  }, [userRole]);

  if (loading) {
    return <div>Đang tải dữ liệu tồn kho...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Sổ Cái Tồn Kho (Vai trò: {userRole})</h1>
      </div>
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
            {inventory.map(lot => (
              <tr key={lot.id}>
                <td>{lot.importDate?.toDate().toLocaleDateString('vi-VN')}</td>
                <td>{lot.productId}</td>
                <td>{lot.productName}</td>
                <td>{lot.lotNumber}</td>
                <td>{lot.expiryDate?.toDate ? lot.expiryDate.toDate().toLocaleDateString('vi-VN') : lot.expiryDate}</td>
                <td>{lot.unit}</td>
                <td>{lot.packaging}</td>
                <td>{lot.quantityImported}</td>
                <td>{lot.quantityRemaining}</td>
                <td>{lot.notes}</td>
                <td>{lot.storageTemp}</td>
                <td>{lot.manufacturer}</td>
                <td>{lot.team}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InventoryPage;