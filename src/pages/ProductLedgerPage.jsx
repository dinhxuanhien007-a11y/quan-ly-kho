// src/pages/ProductLedgerPage.jsx
import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { getProductLedger } from '../services/dashboardService';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import Spinner from '../components/Spinner';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import ViewExportSlipModal from '../components/ViewExportSlipModal';

const ProductLedgerPage = () => {
    const [productId, setProductId] = useState('');
    const [productInfo, setProductInfo] = useState(null);
    const [ledgerData, setLedgerData] = useState(null);
    const [loading, setLoading] = useState(false);

    // THÊM CÁC STATE VÀ HÀM MỚI DƯỚI ĐÂY
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [selectedSlip, setSelectedSlip] = useState(null);

    const openViewModal = async (slipId, slipType) => {
        const collectionName = slipType === 'NHẬP' ? 'import_tickets' : 'export_tickets';
        try {
            const docRef = doc(db, collectionName, slipId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setSelectedSlip({ id: docSnap.id, ...docSnap.data() });
                setIsViewModalOpen(true);
            } else {
                toast.error("Không tìm thấy chi tiết của phiếu này.");
            }
        } catch (error) {
            toast.error("Lỗi khi tải chi tiết phiếu.");
            console.error(error);
        }
    };

    const closeViewModal = () => {
        setIsViewModalOpen(false);
        setSelectedSlip(null);
    };

    const handleSearch = async () => {
        if (!productId.trim()) {
            toast.warn("Vui lòng nhập Mã hàng để xem sổ chi tiết.");
            return;
        }
        setLoading(true);
        setLedgerData(null);
        setProductInfo(null);
        try {
            const productRef = doc(db, 'products', productId.trim().toUpperCase());
            const productSnap = await getDoc(productRef);
            if (!productSnap.exists()) {
                toast.error(`Không tìm thấy sản phẩm với mã: ${productId}`);
                setLoading(false);
                return;
            }
            setProductInfo(productSnap.data());
            
            const data = await getProductLedger(productId);
            setLedgerData(data);

        } catch (error) {
            console.error("Lỗi khi lấy sổ chi tiết vật tư:", error);
            toast.error("Đã xảy ra lỗi khi tải dữ liệu.");
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1>Sổ chi tiết Vật tư (Thẻ kho)</h1>
            </div>

            {/* DÁN ĐOẠN MÃ MỚI VÀO ĐÂY */}
{isViewModalOpen && selectedSlip && (
    selectedSlip.supplierName ? 
    <ViewImportSlipModal slip={selectedSlip} onClose={closeViewModal} /> :
    <ViewExportSlipModal slip={selectedSlip} onClose={closeViewModal} />
)}

            <div className="form-section">
                <div className="form-group">
                    <label>Nhập Mã hàng cần xem</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            value={productId}
                            onChange={(e) => setProductId(e.target.value.toUpperCase())}
                            placeholder="Ví dụ: 02-61860-00"
                            onKeyDown={handleKeyDown}
                            style={{ flexGrow: 1 }}
                            autoFocus
                        />
                        <button onClick={handleSearch} className="btn-primary" disabled={loading} style={{ width: 'auto' }}>
                            {loading ? 'Đang tải...' : 'Xem Sổ kho'}
                        </button>
                    </div>
                </div>
            </div>

            {loading && <Spinner />}

            {ledgerData && productInfo && (
                <>
                    <div className="form-section">
                        <h3>{productInfo.productName} (ĐVT: {productInfo.unit})</h3>
                        <div className="stats-grid">
                            <div className="stat-card"><div className="stat-card-info"><h4>Tồn đầu kỳ</h4><p>{formatNumber(ledgerData.openingBalance)}</p></div></div>
                            <div className="stat-card"><div className="stat-card-info"><h4>Tổng Nhập</h4><p style={{color: 'green'}}>+{formatNumber(ledgerData.totalImport)}</p></div></div>
                            <div className="stat-card"><div className="stat-card-info"><h4>Tổng Xuất</h4><p style={{color: 'red'}}>-{formatNumber(ledgerData.totalExport)}</p></div></div>
                            <div className="stat-card"><div className="stat-card-info"><h4>Tồn cuối kỳ</h4><p style={{color: 'blue'}}>{formatNumber(ledgerData.closingBalance)}</p></div></div>
                        </div>
                    </div>

                    <div className="table-container">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th>Ngày</th>
                                    <th>Chứng từ</th>
                                    <th>Loại</th>
                                    <th>Diễn giải</th>
                                    <th>Số lô</th>
                                    <th>HSD</th>
                                    <th>Nhập</th>
                                    <th>Xuất</th>
                                    <th>Tồn</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style={{fontWeight: 'bold'}}>
                                    <td colSpan="8" style={{textAlign: 'right'}}>Tồn đầu kỳ</td>
                                    <td>{formatNumber(ledgerData.openingBalance)}</td>
                                </tr>
                                {ledgerData.rows.map((row, index) => (
                                    <tr key={`${row.docId}-${index}`}>
                                        <td>{formatDate(row.date)}</td>
                                        <td>
    <button onClick={() => openViewModal(row.docId, row.type)} className="btn-link table-link" title="Xem chi tiết phiếu">
        {row.docId}
    </button>
</td>
                                        <td>{row.type}</td>
                                        <td style={{textAlign: 'left'}}>{row.description}</td>
                                        <td>{row.lotNumber || '(Không có)'}</td>
                                        <td>{row.expiryDate || '(Không có)'}</td>
                                        <td style={{color: 'green'}}>{row.importQty > 0 ? formatNumber(row.importQty) : ''}</td>
                                        <td style={{color: 'red'}}>{row.exportQty > 0 ? formatNumber(row.exportQty) : ''}</td>
                                        <td style={{fontWeight: 'bold'}}>{formatNumber(row.balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default ProductLedgerPage;