// src/pages/LotTracePage.jsx

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc
} from 'firebase/firestore';
import LotJourneyExplorer from '../components/LotJourneyExplorer';
import { formatDate } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import Spinner from '../components/Spinner';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import ViewExportSlipModal from '../components/ViewExportSlipModal';

const LotTracePage = () => {
  const [lotNumber, setLotNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [importRecords, setImportRecords] = useState([]);
  const [exportHistory, setExportHistory] = useState([]);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [totalRemaining, setTotalRemaining] = useState(0);

  // NÂNG CẤP 1: State để quản lý modal xem chi tiết
  const [viewModal, setViewModal] = useState({ isOpen: false, slip: null, type: '' });

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
      let lotQuery;
      const searchTerm = lotNumber.trim();
      if (['null', 'none', 'khongcolo'].includes(searchTerm.toLowerCase())) {
        lotQuery = query(collection(db, 'inventory_lots'), where('lotNumber', '==', null), orderBy('importDate', 'asc'));
      } else {
        lotQuery = query(collection(db, 'inventory_lots'), where('lotNumber', '==', searchTerm), orderBy('importDate', 'asc'));
      }
      
      const lotSnapshot = await getDocs(lotQuery);
      if (lotSnapshot.empty) {
        setIsLoading(false);
        return;
      }

      const foundImports = lotSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setImportRecords(foundImports);

      // Lấy lịch sử xuất kho
      const history = [];
      const exportsQuery = query(collection(db, 'export_tickets'), where('status', '==', 'completed'), orderBy('createdAt', 'asc'));
      const exportsSnapshot = await getDocs(exportsQuery);

      exportsSnapshot.forEach((doc) => {
        const ticket = doc.data();
        const exportedItem = ticket.items.find((item) => item.lotNumber === lotNumber.trim());
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
      
      const totalRemainingFromImports = foundImports.reduce((sum, record) => sum + record.quantityRemaining, 0);
      setTotalRemaining(totalRemainingFromImports);

    } catch (error) {
      console.error('Lỗi khi truy vết lô hàng: ', error);
      toast.error('Đã có lỗi xảy ra khi truy vết.');
    } finally {
      setIsLoading(false);
    }
  };

  // NÂNG CẤP 1: Hàm để mở modal xem chi tiết phiếu
  const handleViewSlip = async (slipId, slipType) => {
    const collectionName = slipType === 'import' ? 'import_tickets' : 'export_tickets';
    toast.info("Đang tải chi tiết phiếu...");
    try {
        const docRef = doc(db, collectionName, slipId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const slipData = { id: docSnap.id, ...docSnap.data() };
            // Làm giàu dữ liệu sản phẩm để hiển thị đầy đủ trong modal
            const productPromises = slipData.items.map(item => getDoc(doc(db, 'products', item.productId)));
            const productSnapshots = await Promise.all(productPromises);
            const productDetailsMap = productSnapshots.reduce((acc, docSn) => {
                if (docSn.exists()) acc[docSn.id] = docSn.data();
                return acc;
            }, {});
            const enrichedItems = slipData.items.map(item => {
                const details = productDetailsMap[item.productId] || {};
                return { ...item, unit: details.unit || '', specification: details.packaging || '', storageTemp: details.storageTemp || '' };
            });

            setViewModal({ 
                isOpen: true, 
                slip: { ...slipData, items: enrichedItems }, 
                type: slipType 
            });
        } else {
            toast.error("Không tìm thấy chi tiết của phiếu này.");
        }
    } catch (error) {
        toast.error("Lỗi khi tải chi tiết phiếu.");
        console.error(error);
    }
  };
  
  const closeViewModal = () => setViewModal({ isOpen: false, slip: null, type: '' });
  const handleNodeClick = (event, node) => setSelectedNode(node.data);
  const handlePaneClick = () => setSelectedNode(null);

  const filteredExportHistory = selectedNode && selectedNode.type === 'customer' 
    ? exportHistory.filter(item => item.customer === selectedNode.name)
    : exportHistory;

  const masterInfo = importRecords.length > 0 ? importRecords[0] : null;
  const totalImported = importRecords.reduce((sum, record) => sum + record.quantityImported, 0);

  return (
    <div>
        {/* NÂNG CẤP 1: Render các modal */}
        {viewModal.isOpen && viewModal.type === 'import' && (
            <ViewImportSlipModal slip={viewModal.slip} onClose={closeViewModal} />
        )}
        {viewModal.isOpen && viewModal.type === 'export' && (
            <ViewExportSlipModal slip={viewModal.slip} onClose={closeViewModal} />
        )}

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
                  placeholder="Ví dụ: 4523468 hoặc 'không có lô'"
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

        {isLoading && <Spinner />}

        {!isLoading && searchAttempted && importRecords.length === 0 && (
            <div className="form-section">
                <h4>Không tìm thấy thông tin cho số lô "{lotNumber}"</h4>
            </div>
        )}

        {!isLoading && importRecords.length > 0 && (
            <div>
                <div className="form-section">
                    <h3 style={{ marginTop: 0 }}>Hành Trình Lô Hàng: {masterInfo.lotNumber || '(Không có lô)'}</h3>
                    <LotJourneyExplorer
                        importRecords={importRecords}
                        exportHistory={exportHistory}
                        totalRemaining={totalRemaining}
                        onNodeClick={handleNodeClick}
                        onPaneClick={handlePaneClick}
                    />
                </div>

                <div className="form-section">
                    <h3 style={{ marginTop: 0 }}>Thông Tin Chung & Tóm Tắt</h3>
                    <div className="compact-info-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                        <div><label>Mã hàng</label><p><strong>{masterInfo.productId}</strong></p></div>
                        <div><label>Tên hàng</label><p>{masterInfo.productName}</p></div>
                        <div>
                            <label>Nhà cung cấp (lần nhập đầu)</label>
                            <p>
                                <Link to={`/partners`} className="table-link">
                                    {masterInfo.supplierName || '(không có)'}
                                </Link>
                            </p>
                        </div>
                        <div><label>ĐVT</label><p>{masterInfo.unit}</p></div>
                        <div><label>Quy cách</label><p>{masterInfo.packaging}</p></div>
                        <div><label>Số lô</label><p><strong>{masterInfo.lotNumber || '(Không có)'}</strong></p></div>
                        <div><label>HSD</label><p><strong>{masterInfo.expiryDate ? formatDate(masterInfo.expiryDate) : '(Không có)'}</strong></p></div>
                        <div><label>Tổng đã nhập</label><p style={{color: 'blue', fontSize: '18px'}}><strong>{totalImported}</strong></p></div>
                        <div><label>Tổng còn lại</label><p style={{color: 'green', fontSize: '18px'}}><strong>{totalRemaining}</strong></p></div>
                    </div>
                </div>

                <div className="form-section">
                    <h3 style={{ marginTop: 0 }}>Chi Tiết Các Lần Nhập Kho</h3>
                    <table className="products-table list-page-table">
                        <thead>
                            <tr>
                                <th>Ngày nhập</th>
                                <th>Nhà cung cấp</th>
                                <th>Số lượng nhập</th>
                                <th>SL còn lại của lần nhập</th>
                                <th>ID Phiếu Nhập Gốc</th>
                            </tr>
                        </thead>
                        <tbody>
                            {importRecords.map((record) => (
                                <tr key={record.id}>
                                    <td>{formatDate(record.importDate)}</td>
                                    <td>
    <Link to={`/partners?search=${record.supplierName || ''}`} className="table-link">
        {record.supplierName || '(không có)'}
    </Link>
</td>
                                    <td>{record.quantityImported}</td>
                                    <td>{record.quantityRemaining}</td>
                                    {/* THÊM DỮ LIỆU CHO CỘT MỚI */}
                                    <td>
                                        {record.importTicketId ? (
                                            <button onClick={() => handleViewSlip(record.importTicketId, 'import')} className="btn-link table-link">
                                                {record.importTicketId}
                                            </button>
                                        ) : (
                                            <span style={{ color: '#888' }}>(Tồn đầu kỳ)</span>
                                        )}
                                    </td>
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
                        <table className="products-table list-page-table">
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
                                        <td>
                                            <button onClick={() => handleViewSlip(item.ticketId, 'export')} className="btn-link table-link">
                                                {item.ticketId}
                                            </button>
                                        </td>
                                        <td>
    <Link to={`/partners?search=${item.customer || ''}`} className="table-link">
        {item.customer}
    </Link>
</td>
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