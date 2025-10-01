// src/pages/ExportListPage.jsx

import React, { useState, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { doc, updateDoc, getDoc, collection, query, orderBy, where, Timestamp } from 'firebase/firestore'; // Thêm where, Timestamp
import { FiCheckCircle, FiXCircle, FiEdit, FiEye, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { PAGE_SIZE } from '../constants';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import { useRealtimeNotification } from '../hooks/useRealtimeNotification';
import ViewExportSlipModal from '../components/ViewExportSlipModal';
import EditExportSlipModal from '../components/EditExportSlipModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate } from '../utils/dateUtils';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import NewDataNotification from '../components/NewDataNotification';
// NÂNG CẤP 1: Import các component cần thiết cho bộ lọc
import DateRangePresets from '../components/DateRangePresets';
import CustomerAutocomplete from '../components/CustomerAutocomplete';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
// src/pages/ExportListPage.jsx

const ExportListPage = () => {
    const [selectedSlip, setSelectedSlip] = useState(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, data: null, title: '', message: '', onConfirm: null, confirmText: 'Xác nhận' });
    const [isProcessing, setIsProcessing] = useState(false);

    // NÂNG CẤP 1: State để quản lý các giá trị của bộ lọc
    const [filters, setFilters] = useState({
        startDate: null, // Sửa thành null
        endDate: null,   // Sửa thành null
        customer: { id: '', name: '' },
        status: 'all',
    });

    // NÂNG CẤP 1: Xây dựng câu truy vấn động dựa trên bộ lọc
    const baseQuery = useMemo(() => {
        let q = query(collection(db, 'export_tickets'), orderBy("createdAt", "desc"));

        if (filters.startDate) {
            q = query(q, where("createdAt", ">=", Timestamp.fromDate(new Date(filters.startDate))));
        }
        if (filters.endDate) {
            const endOfDay = new Date(filters.endDate);
            endOfDay.setHours(23, 59, 59, 999);
            q = query(q, where("createdAt", "<=", Timestamp.fromDate(endOfDay)));
        }
        if (filters.customer.id) {
            q = query(q, where("customerId", "==", filters.customer.id));
        }
        if (filters.status && filters.status !== 'all') {
            q = query(q, where("status", "==", filters.status));
        }
        
        return q;
    }, [filters]);

    const {
        documents: exportSlips,
        loading,
        isLastPage,
        page,
        nextPage,
        prevPage,
        reset
    } = useFirestorePagination(baseQuery, PAGE_SIZE);

    // NÂNG CẤP 1: TÍNH TOÁN CÁC SỐ LIỆU TÓM TẮT
    const summaryStats = useMemo(() => {
        if (loading || !exportSlips) {
            return { total: '...', pending: '...', completed: '...', cancelled: '...' };
        }
        const pending = exportSlips.filter(s => s.status === 'pending').length;
        const completed = exportSlips.filter(s => s.status === 'completed').length;
        const cancelled = exportSlips.filter(s => s.status === 'cancelled').length;
        
        return {
            total: exportSlips.length,
            pending,
            completed,
            cancelled
        };
    }, [exportSlips, loading]);

    const { hasNewData, dismissNewData } = useRealtimeNotification(baseQuery);

    const handleRefresh = () => {
        dismissNewData();
        reset();
    };

// src/pages/ExportListPage.jsx

// THAY THẾ HÀM CŨ BẰNG HÀM NÀY:
const handleConfirmExport = async (slip) => {
    setIsProcessing(true); // Báo cho hệ thống biết là đang xử lý
    try {
      for (const item of slip.items) {
        const lotRef = doc(db, 'inventory_lots', item.lotId);
        const lotSnap = await getDoc(lotRef);
        if (lotSnap.exists()) {
         const currentQuantity = lotSnap.data().quantityRemaining;
          const newQuantityRemaining = currentQuantity - (item.quantityToExport || item.quantityExported);
          if (newQuantityRemaining < 0) {
            toast.error(`Lỗi: Tồn kho của lô ${item.lotNumber} không đủ để xuất.`);
            setIsProcessing(false); // Dừng xử lý nếu có lỗi
            return;
          }
          await updateDoc(lotRef, { quantityRemaining: newQuantityRemaining });
        }
      }
      const slipRef = doc(db, 'export_tickets', slip.id);
      await updateDoc(slipRef, { status: 'completed' });
      toast.success('Xác nhận xuất kho thành công!');
      reset();
    } catch (error) {
      console.error("Lỗi khi xác nhận xuất kho: ", error);
      toast.error('Đã xảy ra lỗi khi xác nhận.');
    } finally {
        setIsProcessing(false); // Luôn tắt trạng thái xử lý khi xong
        setConfirmModal({ isOpen: false });
    }
};

// THAY THẾ HÀM CŨ BẰNG HÀM NÀY (để đồng bộ):
const handleCancelSlip = async (slip) => {
    setIsProcessing(true); // Báo cho hệ thống biết là đang xử lý
    try {
      const slipRef = doc(db, 'export_tickets', slip.id);
      await updateDoc(slipRef, { status: 'cancelled' });
      toast.success('Hủy phiếu xuất thành công!');
      reset();
    } catch (error) {
      console.error("Lỗi khi hủy phiếu: ", error);
      toast.error('Đã xảy ra lỗi khi hủy phiếu.');
    } finally {
       setIsProcessing(false); // Luôn tắt trạng thái xử lý khi xong
       setConfirmModal({ isOpen: false });
    }
};

  const handleSaveSlipChanges = async (updatedSlip) => {
    try {
      const slipDocRef = doc(db, "export_tickets", updatedSlip.id);
      await updateDoc(slipDocRef, { 
          items: updatedSlip.items,
          customer: updatedSlip.customer,
          description: updatedSlip.description,
          exportDate: updatedSlip.exportDate // <-- THÊM DÒNG NÀY
      });
      setIsEditModalOpen(false);
      reset();
      toast.success('Cập nhật phiếu xuất thành công!');
    } catch (error) {
      console.error("Lỗi khi cập nhật phiếu xuất: ", error);
      toast.error('Đã xảy ra lỗi khi cập nhật.');
    }
  };

const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
    };

    const handlePresetSelect = (startDate, endDate) => {
        setFilters(prev => ({ ...prev, startDate, endDate }));
    };

const promptAction = (action, slip) => {
    if (action === 'confirm') {
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xuất kho?",
            message: `Bạn có chắc muốn xuất kho cho phiếu của khách hàng "${slip.customer}" không?`,
            onConfirm: () => handleConfirmExport(slip),
            confirmText: "Xác nhận"
        });
    } else if (action === 'cancel') {
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận hủy phiếu?",
            message: `Bạn có chắc muốn HỦY phiếu xuất của khách hàng "${slip.customer}" không? Thao tác này sẽ không trừ tồn kho.`,
            onConfirm: () => handleCancelSlip(slip),
            confirmText: "Đồng ý hủy"
        });
    }
  };

  // src/pages/ExportListPage.jsx

    const openViewModal = async (slip) => {
        try {
            toast.info("Đang tải chi tiết phiếu...");
            const docRef = doc(db, 'export_tickets', slip.id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const slipData = { id: docSnap.id, ...docSnap.data() };

                // --- BẮT ĐẦU LÀM GIÀU DỮ LIỆU ---
                const productPromises = slipData.items.map(item => getDoc(doc(db, 'products', item.productId)));
                const productSnapshots = await Promise.all(productPromises);
                
                const productDetailsMap = productSnapshots.reduce((acc, docSn) => {
                    if (docSn.exists()) {
                        acc[docSn.id] = docSn.data();
                    }
                    return acc;
                }, {});

                const enrichedItems = slipData.items.map(item => {
                    const details = productDetailsMap[item.productId] || {};
                    return {
                        ...item,
                        unit: details.unit || '',
                        specification: details.packaging || '', // Sửa 'specification' thành 'packaging'
                        storageTemp: details.storageTemp || '',
                    };
                });

                const enrichedSlip = { ...slipData, items: enrichedItems };
                // --- KẾT THÚC LÀM GIÀU DỮ LIỆU ---

                setSelectedSlip(enrichedSlip);
                setIsViewModalOpen(true);
            } else {
                toast.error("Không tìm thấy phiếu xuất này nữa.");
            }
        } catch (error) {
            console.error("Lỗi khi tải chi tiết phiếu xuất:", error);
            toast.error("Đã xảy ra lỗi khi tải chi tiết phiếu.");
        }
    };
  
  const openEditModal = async (slip) => {
    const slipWithDetails = JSON.parse(JSON.stringify(slip));
    try {
      toast.info("Đang lấy dữ liệu tồn kho mới nhất...");
      for (const item of slipWithDetails.items) {
        if (item.lotId) {
          const lotRef = doc(db, 'inventory_lots', item.lotId);
          const lotSnap = await getDoc(lotRef);
          if (lotSnap.exists()) {
            item.quantityRemaining = lotSnap.data().quantityRemaining;
          } else {
            item.quantityRemaining = 0;
            toast.warn(`Lô ${item.lotNumber} không còn tồn tại trong kho.`);
          }
        }
      }
      setSelectedSlip(slipWithDetails);
      setIsEditModalOpen(true);
    } catch (error) {
      console.error("Lỗi khi lấy chi tiết lô để chỉnh sửa:", error);
      toast.error("Không thể lấy dữ liệu tồn kho mới nhất.");
    }
  };

return (
    <div>
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false })}
        confirmText={confirmModal.confirmText}
        isConfirming={isProcessing}
      />
      {isEditModalOpen && ( <EditExportSlipModal slip={selectedSlip} onClose={() => setIsEditModalOpen(false)} onSave={handleSaveSlipChanges} /> )}
      {isViewModalOpen && ( <ViewExportSlipModal slip={selectedSlip} onClose={() => setIsViewModalOpen(false)} /> )}
      
      <div className="page-header">
        <h1>Danh sách Phiếu Xuất Kho</h1>
      </div>
{/* NÂNG CẤP 1: KHU VỰC BỘ LỌC */}
            <div className="form-section">
                <DateRangePresets onPresetSelect={handlePresetSelect} />
                <div className="form-row">
                    <div className="form-group">
                        <label>Từ ngày</label>
                        {/* NÂNG CẤP GIAO DIỆN: Thay thế input bằng DatePicker */}
                        <DatePicker
                            selected={filters.startDate}
                            onChange={(date) => handleFilterChange('startDate', date)}
                            dateFormat="dd/MM/yyyy"
                            placeholderText="Chọn ngày bắt đầu"
                            className="search-input"
                            isClearable
                        />
                    </div>
                    <div className="form-group">
                        <label>Đến ngày</label>
                        {/* NÂNG CẤP GIAO DIỆN: Thay thế input bằng DatePicker */}
                        <DatePicker
                            selected={filters.endDate}
                            onChange={(date) => handleFilterChange('endDate', date)}
                            dateFormat="dd/MM/yyyy"
                            placeholderText="Chọn ngày kết thúc"
                            className="search-input"
                            isClearable
                        />
                    </div>
                </div>
                <div className="form-row" style={{ marginTop: '15px' }}>
                    <div className="form-group">
                        <label>Khách hàng</label>
                        <CustomerAutocomplete 
                            value={filters.customer.name}
                            onSelect={(customer) => handleFilterChange('customer', customer)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Trạng thái</label>
                        <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
                            <option value="all">Tất cả trạng thái</option>
                            <option value="pending">Đang chờ</option>
                            <option value="completed">Hoàn thành</option>
                            <option value="cancelled">Đã hủy</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* NÂNG CẤP 1: HIỂN THỊ CÁC THẺ THỐNG KÊ */}
            <div className="stats-grid" style={{ marginBottom: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="stat-card">
                    <div className="stat-card-info">
                        <h4>Tổng Số Phiếu (trang này)</h4>
                        <p>{summaryStats.total}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-info">
                        <h4>Đang Chờ Xử Lý</h4>
                        <p style={{ color: '#ffc107' }}>{summaryStats.pending}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-info">
                        <h4>Đã Hoàn Thành</h4>
                        <p style={{ color: '#28a745' }}>{summaryStats.completed}</p>
                    </div>
                </div>
                 <div className="stat-card">
                    <div className="stat-card-info">
                        <h4>Đã Hủy</h4>
                        <p style={{ color: '#6c757d' }}>{summaryStats.cancelled}</p>
                    </div>
                </div>
            </div>

            <NewDataNotification
                isVisible={hasNewData}
                onRefresh={handleRefresh}
                message="Có phiếu xuất mới!"
            />

            {loading ? <Spinner /> : (
                <>
                    <table className="products-table list-page-table">
<thead>
                <tr>
                    <th>Ngày tạo</th>
                    <th>Khách hàng / Nơi nhận</th>
                    <th>Diễn giải</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                </tr>
                </thead>
                <tbody>
{exportSlips.length > 0 ? exportSlips.map(slip => (
                                <tr key={slip.id}>
                                    <td>{formatDate(slip.createdAt)}</td>
                                    <td>{slip.customer}</td>
                                    <td>{slip.description}</td>
                                    <td><StatusBadge status={slip.status} /></td>
                                    <td>
<div className="action-buttons">
                                <button className="btn-icon btn-view" title="Xem chi tiết" onClick={() => openViewModal(slip)}>
                                    <FiEye />
                                </button>
                                {slip.status === 'pending' && (
                                <>
                                    <button className="btn-icon btn-edit" title="Sửa phiếu" onClick={() => openEditModal(slip)}>
                                        <FiEdit />
                                    </button>
                                    <button className="btn-icon btn-delete" title="Hủy phiếu" onClick={() => promptAction('cancel', slip)}>
                                        <FiXCircle />
                                    </button>
                                    <button className="btn-icon btn-confirm" title="Xác nhận xuất kho" onClick={() => promptAction('confirm', slip)}>
                                        <FiCheckCircle />
                                    </button>
                                </>
                                )}
                            </div>
                        </td>
                    </tr>
)) : (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center' }}>Không tìm thấy phiếu xuất nào khớp với điều kiện.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
<div className="pagination-controls">
                <button onClick={prevPage} disabled={page <= 1 || loading}>
                    <FiChevronLeft /> Trang Trước
                </button>
                <span>Trang {page}</span>
                <button onClick={nextPage} disabled={isLastPage || loading}>
                    Trang Tiếp <FiChevronRight />
                </button>
            </div>
        </>
)}
        </div>
    );
};

export default ExportListPage;