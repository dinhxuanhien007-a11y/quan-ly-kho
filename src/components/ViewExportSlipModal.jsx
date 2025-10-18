// src/components/ViewExportSlipModal.jsx
import React, { useMemo } from 'react';
import Modal from 'react-modal';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import { FiX, FiPrinter } from 'react-icons/fi';
import { exportExportSlipToPDF } from '../utils/pdfUtils';
import { toast } from 'react-toastify';

Modal.setAppElement('#root');

const ViewExportSlipModal = ({ slip, onClose }) => {
    if (!slip) return null;

// === DÁN TOÀN BỘ KHỐI CODE NÀY VÀO ĐÂY ===
    // Logic để gộp các dòng có cùng Mã hàng và Số lô lại với nhau
    const aggregatedItems = useMemo(() => {
        if (!slip || !slip.items) return [];

        const aggregator = new Map();

        for (const item of slip.items) {
            // Tạo một key duy nhất cho mỗi nhóm sản phẩm-lô
            const key = `${item.productId}-${item.lotNumber}`;
            const quantity = Number(item.quantity || item.quantityToExport || item.quantityExported || 0);

            if (aggregator.has(key)) {
                // Nếu đã có, cộng dồn số lượng
                const existingItem = aggregator.get(key);
                existingItem.quantity += quantity;
            } else {
                // Nếu chưa có, thêm mới vào Map
                aggregator.set(key, {
                    ...item,
                    quantity: quantity, // Tạo một trường `quantity` đã được chuẩn hóa
                });
            }
        }

        return Array.from(aggregator.values());
    }, [slip]); // Chỉ chạy lại logic này khi dữ liệu `slip` thay đổi
    // === KẾT THÚC PHẦN DÁN ===

    console.log("Dữ liệu Phiếu Xuất được truyền vào Modal:", slip);
    
    const handleExportPDF = async () => {
        toast.info("Đang tạo file PDF...");
        try {
            await exportExportSlipToPDF(slip);
        } catch (error) {
            console.error("Lỗi khi xuất PDF phiếu xuất:", error);
            toast.error("Đã xảy ra lỗi khi tạo file PDF.");
        }
    };

    // Hàm helper để xử lý HSD: Kiểm tra nếu là đối tượng Timestamp (từ lô mới chọn) thì định dạng, 
    // nếu là chuỗi (từ dữ liệu cũ) thì hiển thị chuỗi, nếu là null thì hiển thị N/A.
    const renderExpiryDate = (date) => {
        if (!date) return 'N/A';
        // Nếu là chuỗi (dữ liệu cũ đã định dạng hoặc 'N/A'), hiển thị luôn
        if (typeof date === 'string') return date;
        // Nếu là đối tượng Timestamp, sử dụng formatDate
        return formatDate(date);
    };

    return (
        <Modal isOpen={true} onRequestClose={onClose} className="modal" overlayClassName="overlay" contentLabel="Chi tiết Phiếu Xuất">
            <div className="modal-header">
                <h2>Chi tiết Phiếu Xuất Kho</h2>
                <button onClick={onClose} className="close-button"><FiX /></button>
            </div>
            <div className="modal-body">
                <div id="slip-content">
                    <div className="slip-info">
                        <p><strong>Mã phiếu:</strong> {slip.id}</p>
                        
                        {/* SỬA LỖI 1: Ngăn crash khi hiển thị slip.createdAt */}
                        <p><strong>Ngày xuất:</strong> {slip.createdAt ? formatDate(slip.createdAt) : 'Không có'}</p>
                        
                        <p><strong>Khách hàng:</strong> {slip.customer || ''}</p>
                        {/* --- THAY ĐỔI TẠI ĐÂY: Sửa slip.notes thành slip.description --- */}
                        <p><strong>Ghi chú:</strong> {slip.description || 'Không có'}</p>
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
                                    <th>Nhiệt độ BQ</th>
                                </tr>
                            </thead>
                            <tbody>
    {aggregatedItems.map((item, index) => (
        <tr key={index}>
            <td>{item.productId}</td>
            <td>{item.productName}</td>
            <td>{item.lotNumber}</td>
            <td>{renderExpiryDate(item.expiryDate)}</td>
            <td>{item.unit}</td>
            <td>{item?.packaging || ''}</td>
            <td style={{ textAlign: 'center' }}>
                {formatNumber(item.quantity)}
            </td>
            <td>{item.notes || ''}</td>
            <td>{item.storageTemp}</td>
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

export default ViewExportSlipModal;