// src/components/ViewImportSlipModal.jsx
import React from 'react';
import Modal from 'react-modal';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import { FiX, FiPrinter } from 'react-icons/fi';
import { exportImportSlipToPDF } from '../utils/pdfUtils';
import { toast } from 'react-toastify';

Modal.setAppElement('#root');

const ViewImportSlipModal = ({ slip, onClose }) => {
    if (!slip) return null;

    // --- CÔNG CỤ CHẨN ĐOÁN ---
    // Dòng này sẽ in ra toàn bộ dữ liệu của phiếu vào Console của trình duyệt (F12)
    // Giúp bạn kiểm tra chính xác tên các trường dữ liệu mà code nhận được.
    console.log("Dữ liệu Phiếu Nhập được truyền vào Modal:", slip);

    const handleExportPDF = async () => {
        toast.info("Đang tạo file PDF...");
        try {
            await exportImportSlipToPDF(slip);
        } catch (error) {
            console.error("Lỗi khi xuất PDF phiếu nhập:", error);
            toast.error("Đã xảy ra lỗi khi tạo file PDF.");
        }
    };

    return (
        <Modal isOpen={true} onRequestClose={onClose} className="modal" overlayClassName="overlay" contentLabel="Chi tiết Phiếu Nhập">
            <div className="modal-header">
                <h2>Chi tiết Phiếu Nhập Kho</h2>
                <button onClick={onClose} className="close-button"><FiX /></button>
            </div>
            <div className="modal-body">
                <div id="slip-content">
                    <div className="slip-info">
                        <p><strong>Mã phiếu:</strong> {slip.id}</p>
                        <p><strong>Ngày nhập:</strong> {slip.createdAt ? formatDate(slip.createdAt.toDate()) : 'Không có'}</p>
                        <p><strong>Nhà cung cấp:</strong> {slip.supplierName}</p>
                        <p><strong>Ghi chú:</strong> {slip.notes || 'Không có'}</p>
                    </div>
                    <div className="table-container">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th>Mã hàng</th>
                                    <th>Tên sản phẩm</th>
                                    <th>Số lô</th>
                                    <th>HSD</th>
                                    <th>ĐVT</th>
                                    <th>Quy cách</th>
                                    <th>Số lượng</th>
                                    <th>Ghi chú</th>
                                    <th>Team</th>
                                </tr>
                            </thead>
                            <tbody>
                                {slip.items.map((item, index) => (
                                    <tr key={index}>
                                        <td>{item.productId}</td>
                                        <td>{item.productName}</td>
                                        <td>{item.lotNumber}</td>
                                        <td>{item.expiryDate}</td>
                                        <td>{item.unit}</td>
                                        {/* SỬA LỖI: Sử dụng optional chaining để hiển thị an toàn */}
                                        <td>{item?.specification || ''}</td>
                                        <td style={{ textAlign: 'center' }}>{formatNumber(item?.quantity)}</td>
                                        <td>{item.notes || ''}</td>
                                        <td>{item.team || ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div className="modal-footer">
                <button onClick={handleExportPDF} className="btn-primary">
                    <FiPrinter style={{ marginRight: '5px' }} />
                    Xuất PDF
                </button>
                <button onClick={onClose} className="btn-secondary">Đóng</button>
            </div>
        </Modal>
    );
};

export default ViewImportSlipModal;