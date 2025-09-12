// src/pages/LotTracePage.jsx
import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import LotJourneyExplorer from '../components/LotJourneyExplorer';
import { formatDate } from '../utils/dateUtils';
import { toast } from 'react-toastify';

const LotTracePage = () => {
  const [lotNumber, setLotNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [importRecords, setImportRecords] = useState([]);
  const [exportHistory, setExportHistory] = useState([]);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  const handleTrace = async () => {
    if (!lotNumber) {
      toast.warn('Vui lòng nhập số lô cần truy vết.');
      return;
    }
    setIsLoading(true);
    setImportRecords([]);
    setExportHistory([]);
    setSearchAttempted(true);
    setSelectedNode(null);
    try {
      const lotQuery = query(
        collection(db, 'inventory_lots'),
        where('lotNumber', '==', lotNumber.trim()),
        orderBy('importDate', 'asc'),
      );
      const lotSnapshot = await getDocs(lotQuery);

      if (lotSnapshot.empty) {
        setIsLoading(false);
        return;
      }

      const foundImports = lotSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setImportRecords(foundImports);

      const history = [];
      const exportsQuery = query(
        collection(db, 'export_tickets'),
        orderBy('createdAt', 'asc'),
      );
      const exportsSnapshot = await getDocs(exportsQuery);

      exportsSnapshot.forEach((doc) => {
        const ticket = doc.data();
        const exportedItem = ticket.items.find(
          (item) => item.lotNumber === lotNumber.trim(),
        );
        if (exportedItem) {
          history.push({
            ticketId: doc.id,
            exportDate: ticket.createdAt,
            customer: ticket.customer,
            quantityExported: exportedItem.quantityToExport || exportedItem.quantityExported || 0,
          });
        }
      });
      setExportHistory(history);
    } catch (error) {
      console.error('Lỗi khi truy vết lô hàng: ', error);
      toast.error('Đã có lỗi xảy ra khi truy vết.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNodeClick = (event, node) => {
    setSelectedNode(node.data);
  };
  
  const handlePaneClick = () => {
    setSelectedNode(null);
  };
  
  const filteredExportHistory = selectedNode && selectedNode.type === 'customer'
    ? exportHistory.filter(item => item.customer === selectedNode.name)
    : exportHistory;

  const masterInfo = importRecords.length > 0 ? importRecords[0] : null;
  
  const totalImported = importRecords.reduce(
    (sum, record) => sum + record.quantityImported,
    0,
  );
  
  const totalRemaining = importRecords.reduce(
    (sum, record) => sum + record.quantityRemaining,
    0,
  );
  
  return (
    <div>
      <div className="page-header">
        <h1>Truy Vết Lô Hàng</h1>
      </div>

      <div className="form-section">
        <div className="form-group">
          <label>Nhập Số Lô Cần Truy Vết</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="Ví dụ: 4523468"
              onKeyDown={(e) => e.key === 'Enter' && handleTrace()}
              style={{ flexGrow: 1 }}
            />
            <button
              onClick={handleTrace}
              className="btn-primary"
              disabled={isLoading}
              style={{ width: 'auto' }}
            >
              {isLoading ? 'Đang tìm...' : 'Truy vết'}
            </button>
          </div>
        </div>
      </div>

      {isLoading && <p>Đang tải dữ liệu...</p>}

      {!isLoading && searchAttempted && importRecords.length === 0 && (
        <div className="form-section">
          <h4>Không tìm thấy thông tin cho số lô "{lotNumber}"</h4>
        </div>
      )}

      {!isLoading && importRecords.length > 0 && (
        <div>
          <div className="form-section">
            <h3 style={{ marginTop: 0 }}>Hành Trình Lô Hàng: {masterInfo.lotNumber}</h3>
            <LotJourneyExplorer
              importRecords={importRecords}
              exportHistory={exportHistory}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
            />
          </div>

          <div className="form-section">
            <h3 style={{ marginTop: 0 }}>Thông Tin Chung & Tóm Tắt</h3>
            <div className="compact-info-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div><label>Mã hàng</label><p><strong>{masterInfo.productId}</strong></p></div>
              <div><label>Tên hàng</label><p>{masterInfo.productName}</p></div>
              <div><label>Nhà cung cấp (lần nhập đầu)</label><p>{masterInfo.supplier || '(không có)'}</p></div>
              <div><label>ĐVT</label><p>{masterInfo.unit}</p></div>
              <div><label>Quy cách</label><p>{masterInfo.packaging}</p></div>
              <div><label>Số lô</label><p><strong>{masterInfo.lotNumber}</strong></p></div>
              <div><label>HSD</label><p><strong>{formatDate(masterInfo.expiryDate)}</strong></p></div>
              <div><label>Tổng đã nhập</label><p style={{color: 'blue', fontSize: '18px'}}><strong>{totalImported}</strong></p></div>
              <div><label>Tổng còn lại</label><p style={{color: 'green', fontSize: '18px'}}><strong>{totalRemaining}</strong></p></div>
            </div>
          </div>

          <div className="form-section">
            <h3 style={{ marginTop: 0 }}>Chi Tiết Các Lần Nhập Kho</h3>
            <table className="products-table">
              <thead>
                <tr>
                  <th>Ngày nhập</th>
                  <th>Nhà cung cấp</th>
                  <th>Số lượng nhập</th>
                  <th>SL còn lại của lần nhập</th>
                </tr>
              </thead>
              <tbody>
                {importRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDate(record.importDate)}</td>
                    <td>{record.supplier || '(không có)'}</td>
                    <td>{record.quantityImported}</td>
                    <td>{record.quantityRemaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-section">
            <h3 style={{ marginTop: 0 }}>
              {selectedNode && selectedNode.type === 'customer' 
                ? `Lịch Sử Xuất Kho cho: ${selectedNode.name}`
                : 'Toàn Bộ Lịch Sử Xuất Kho'
              }
            </h3>
            {filteredExportHistory.length > 0 ? (
              <table className="products-table">
                <thead>
                  <tr>
                    <th>Ngày xuất</th>
                    <th>ID Phiếu xuất</th>
                    <th>Khách hàng</th>
                    <th>Số lượng đã xuất</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExportHistory.map((item) => (
                    <tr key={item.ticketId}>
                      <td>{formatDate(item.exportDate)}</td>
                      <td>{item.ticketId}</td>
                      <td>{item.customer}</td>
                      <td>{item.quantityExported}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (<p>Lô hàng này chưa được xuất kho lần nào.</p>)}
          </div>
        </div>
      )}
    </div>
  );
};

export default LotTracePage;