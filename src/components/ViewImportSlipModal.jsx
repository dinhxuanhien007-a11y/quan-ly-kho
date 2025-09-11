// src/components/ViewImportSlipModal.jsx
import React from 'react';
import { formatDate } from '../utils/dateUtils'; // BƯỚC 1: Import hàm tiện ích

const ViewImportSlipModal = ({ slip, onClose }) => {
    if (!slip) return null;

    const hasNotes = slip.items.some(item => item.notes && item.notes.trim() !== '');

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content printable-area" style={{ width: '90vw', maxWidth: '1200px' }}>
                <h2>Chi Tiết Phiếu Nhập Kho</h2>
                
                <div className="compact-info-grid">
                    <div><label>ID Phiếu</label><p><strong>{slip.id}</strong></p></div>
                    <div><label>Nhà cung cấp</label><p><strong>{slip.supplier}</strong></p></div>
                    <div><label>Ngày tạo</label>
                        {/* BƯỚC 2: Sử dụng hàm formatDate */}
                        <p><strong>{formatDate(slip.createdAt)}</strong></p>
                    </div>
                    <div><label>Trạng thái</label><p><span className={`status-badge status-${slip.status}`}>{slip.status === 'pending' ? 'Đang chờ' : 'Hoàn thành'}</span></p></div>
                    <div className="info-description"><label>Diễn giải</label><p><em>{slip.description || '(Không có)'}</em></p></div>
                </div>

                <div className="modal-body">
                    <h3 style={{marginTop: '10px'}}>Chi tiết hàng hóa</h3>
                    <div className="table-container" style={{maxHeight: 'none', border: 'none'}}>
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th>Mã hàng</th>
                                    <th>Tên hàng</th>
                                    <th>Số lô</th>
                                    <th>HSD</th>
                                    <th>Số lượng</th>
                                    <th>ĐVT</th>
                                    <th>Quy cách</th>
                                    {hasNotes && <th>Ghi chú</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {slip.items.map((item, index) => (
                                    <tr key={index}>
                                        <td>{item.productId}</td>
                                        <td>{item.productName}</td>
                                        <td>{item.lotNumber}</td>
                                        <td>{item.expiryDate}</td>
                                        <td>{item.quantity}</td>
                                        <td>{item.unit}</td>
                                        <td>{item.packaging}</td>
                                        {hasNotes && <td>{item.notes}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="modal-actions">
                    <button type="button" onClick={handlePrint} className="btn-secondary">In Phiếu</button>
                    <button type="button" onClick={onClose} className="btn-primary">Đóng</button>
                </div>
            </div>
        </div>
    );
};

export default ViewImportSlipModal;
