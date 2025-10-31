// src/pages/ImportListPage.jsx

import React, { useState, useMemo } from 'react';
import { doc, updateDoc, addDoc, Timestamp, collection, query, orderBy, deleteDoc, getDoc, where } from 'firebase/firestore'; // Thêm "where"
import { FiEdit, FiEye, FiChevronLeft, FiChevronRight, FiTrash2, FiCheckCircle } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { db } from '../firebaseConfig';
import { PAGE_SIZE } from '../constants';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import { useRealtimeNotification } from '../hooks/useRealtimeNotification';
import EditImportSlipModal from '../components/EditImportSlipModal';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { parseDateString, formatDate } from '../utils/dateUtils';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import NewDataNotification from '../components/NewDataNotification';
// NÂNG CẤP 1: Import các component cần thiết cho bộ lọc
import DateRangePresets from '../components/DateRangePresets';
import SupplierAutocomplete from '../components/SupplierAutocomplete';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const ImportListPage = () => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedSlip, setSelectedSlip] = useState(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null, title: '', message: '', confirmText: '', action: null });
    const [isProcessing, setIsProcessing] = useState(false);

    // NÂNG CẤP 1: State để quản lý các giá trị của bộ lọc
    const [filters, setFilters] = useState({
        startDate: null, // Sửa thành null để tương thích với DatePicker
        endDate: null,   // Sửa thành null
        supplier: { id: '', name: '' },
        status: 'all',
    });

    // NÂNG CẤP 1: Xây dựng câu truy vấn động dựa trên bộ lọc
    const baseQuery = useMemo(() => {
        let q = query(collection(db, 'import_tickets'), orderBy("createdAt", "desc"));

        if (filters.startDate) {
            q = query(q, where("createdAt", ">=", Timestamp.fromDate(new Date(filters.startDate))));
        }
        if (filters.endDate) {
            const endOfDay = new Date(filters.endDate);
            endOfDay.setHours(23, 59, 59, 999);
            q = query(q, where("createdAt", "<=", Timestamp.fromDate(endOfDay)));
        }
        if (filters.supplier.id) {
            q = query(q, where("supplierId", "==", filters.supplier.id));
        }
        if (filters.status && filters.status !== 'all') {
            q = query(q, where("status", "==", filters.status));
        }

        return q;
    }, [filters]); // Chạy lại khi bộ lọc thay đổi

    const { 
        documents: importSlips, 
        loading, 
        isLastPage, 
        page, 
        nextPage, 
        prevPage,
        reset
    } = useFirestorePagination(baseQuery, PAGE_SIZE);

    // NÂNG CẤP 1: TÍNH TOÁN CÁC SỐ LIỆU TÓM TẮT
    const summaryStats = useMemo(() => {
        if (loading || !importSlips) {
            return { total: '...', pending: '...', completed: '...' };
        }
        const pending = importSlips.filter(s => s.status === 'pending').length;
        const completed = importSlips.filter(s => s.status === 'completed').length;
        
        return {
            total: importSlips.length,
            pending,
            completed
        };
    }, [importSlips, loading]);

    const { hasNewData, dismissNewData } = useRealtimeNotification(baseQuery);

    const handleRefresh = () => {
        dismissNewData();
        reset();
    };

const handleConfirmImport = async (slipToConfirm) => {
        if (!slipToConfirm) return;
        setIsProcessing(true);
        const slip = slipToConfirm;
        
        try {
        // === BƯỚC 1: TRUY VẤN VÀ LÀM GIÀU DỮ LIỆU SẢN PHẨM GỐC (THÊM subGroup) ===
        const productIdsInSlip = [...new Set(slip.items.map(item => item.productId))];
        const productPromises = productIdsInSlip.map(productId => getDoc(doc(db, 'products', productId)));
        const productSnapshots = await Promise.all(productPromises);
        
        const productDetailsMap = productSnapshots.reduce((acc, docSn) => {
            if (docSn.exists()) {
                // SỬ DỤNG product ID LÀM KEY, CHUẨN HÓA VỀ CHUỖI VÀ LOWERCASE ĐỂ XỬ LÝ LỖI KEY BỊ BỎ QUA Ở BƯỚC 1
                const standardizedId = String(docSn.id).trim().toLowerCase(); 
                acc[standardizedId] = docSn.data();
            }
            return acc;
        }, {});
        
        console.log("PRODUCT DETAILS MAP:", productDetailsMap); // Xem map có đầy đủ không
        // === BƯỚC 2: TẠO LÔ HÀNG VỚI subGroup ===
        for (const item of slip.items) {
            // Chuẩn hóa key của item để tra cứu
            const itemKey = String(item.productId).trim().toLowerCase();
            const productDetails = productDetailsMap[itemKey] || {};
            
            // Lấy subGroup và đảm bảo nó là chuỗi, nếu không có thì là chuỗi rỗng
            const subGroupValue = productDetails.subGroup || ''; 

            console.log(`Processing item: ${item.productId}, Key: ${itemKey}`);
            console.log("Product Details Found:", productDetails);
            console.log("SubGroup Value:", subGroupValue);
            
            // Xử lý HSD
            let expiryTimestamp = null;
            if (item.expiryDate && item.expiryDate.trim() !== '' && item.expiryDate.toUpperCase() !== 'N/A') {
                const expiryDateObject = parseDateString(item.expiryDate);
                if (!expiryDateObject) {
                    toast.error(`HSD của mặt hàng ${item.productName} (${item.lotNumber}) có định dạng sai. Vui lòng sửa lại.`);
                    setIsProcessing(false);
                    return; // Dừng hàm ngay tại đây
                }
                expiryTimestamp = Timestamp.fromDate(expiryDateObject);
            }

            const importDateObject = parseDateString(slip.importDate);
            const importTimestamp = importDateObject ? Timestamp.fromDate(importDateObject) : Timestamp.now();

            const newLotData = {
                importTicketId: slip.id,
                importDate: importTimestamp,
                productId: item.productId,
                productName: item.productName,
                lotNumber: item.lotNumber,
                expiryDate: expiryTimestamp,
                unit: item.unit,
                packaging: item.packaging,
                storageTemp: item.storageTemp,
                team: item.team || '', 
                manufacturer: productDetails.manufacturer || '', // <-- Sửa ở đây, lấy từ productDetails
                // === THÊM subGroup VÀO ĐÂY ===
                subGroup: subGroupValue,
                // ==============================
                quantityImported: Number(item.quantity),
                quantityRemaining: Number(item.quantity),
                notes: item.notes,
                supplierName: slip.supplierName,
            };
            await addDoc(collection(db, "inventory_lots"), newLotData);
        }

            const slipDocRef = doc(db, "import_tickets", slip.id);
            await updateDoc(slipDocRef, { status: "completed" });
            
            toast.success('Xác nhận nhập kho thành công!');
            reset();
        } catch (error) {
            console.error("Lỗi khi xác nhận nhập kho: ", error);
            toast.error('Đã xảy ra lỗi khi xác nhận nhập kho.');
        } finally {
        setIsProcessing(false); // <-- TẮT TRẠNG THÁI XỬ LÝ KHI XONG
    }
    };

    const handleSaveSlipChanges = async (updatedSlip) => {
        try {
            const slipDocRef = doc(db, "import_tickets", updatedSlip.id);
            await updateDoc(slipDocRef, { 
                items: updatedSlip.items,
                description: updatedSlip.description,
                importDate: updatedSlip.importDate
            });

            setIsEditModalOpen(false);
            reset();
            toast.success('Cập nhật phiếu nhập thành công!');
        } catch (error) {
            console.error("Lỗi khi cập nhật phiếu nhập: ", error);
            toast.error('Đã xảy ra lỗi khi cập nhật.');
        }
    };

const handleDeleteSlip = async (slipToDelete) => {
        if (!slipToDelete) return;
        
        toast.info(`Đang xóa phiếu nhập...`);
        try {
            const slipDocRef = doc(db, "import_tickets", slipToDelete.id);
            await deleteDoc(slipDocRef);
            toast.success(`Đã xóa thành công phiếu nhập của NCC "${slipToDelete.supplierName}".`);
            reset();
        } catch (error) {
            console.error("Lỗi khi xóa phiếu nhập: ", error);
            toast.error("Đã xảy ra lỗi khi xóa phiếu nhập.");
        }
    };

const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
    };

    const handlePresetSelect = (startDate, endDate) => {
        setFilters(prev => ({ ...prev, startDate, endDate }));
    };

const promptForConfirm = (slip) => {
        setConfirmModal({
            isOpen: true,
            item: slip,
            action: 'confirm', // Gán hành động là 'confirm'
            title: "Xác nhận nhập kho?",
            message: `Bạn có chắc muốn xác nhận và đưa hàng trong phiếu của NCC "${slip.supplierName}" vào kho không? Thao tác này sẽ cập nhật tồn kho.`,
            confirmText: "Xác nhận"
        });
    };
    
    const promptForDelete = (slip) => {
        setConfirmModal({
            isOpen: true,
            item: slip,
            action: 'delete', // Gán hành động là 'delete'
            title: "Xác nhận xóa phiếu nhập?",
            message: `Bạn có chắc muốn xóa vĩnh viễn phiếu nhập của NCC "${slip.supplierName}" không? Thao tác này không thể hoàn tác.`,
            confirmText: "Vẫn xóa"
        });
    };
    // === KẾT THÚC CẬP NHẬT CÁC HÀM prompt... ===

    // === BẮT ĐẦU HÀM XỬ LÝ TRUNG TÂM MỚI ===
    const handleModalConfirm = () => {
        const { action, item } = confirmModal;
        
        // Đóng modal trước khi thực hiện hành động
        setConfirmModal({ isOpen: false, item: null, action: null });

        if (action === 'confirm') {
            handleConfirmImport(item);
        } else if (action === 'delete') {
            handleDeleteSlip(item);
        }
    };
    // === KẾT THÚC HÀM XỬ LÝ TRUNG TÂM MỚI ===

    const openEditModal = (slip) => { setSelectedSlip(slip); setIsEditModalOpen(true); };
    // src/pages/ImportListPage.jsx

    const openViewModal = async (slip) => {
        try {
            toast.info("Đang tải chi tiết phiếu...");
            const docRef = doc(db, 'import_tickets', slip.id);
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
                        specification: details.packaging || '',
                        storageTemp: details.storageTemp || '',
                    };
                });

                const enrichedSlip = { ...slipData, items: enrichedItems };
                // --- KẾT THÚC LÀM GIÀU DỮ LIỆU ---

                setSelectedSlip(enrichedSlip);
                setIsViewModalOpen(true);
            } else {
                toast.error("Không tìm thấy phiếu nhập này nữa.");
            }
        } catch (error) {
            console.error("Lỗi khi tải chi tiết phiếu nhập:", error);
            toast.error("Đã xảy ra lỗi khi tải chi tiết phiếu.");
        }
    };

return (
        <div>
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={handleModalConfirm} // <-- THAY ĐỔI QUAN TRỌNG
                onCancel={() => setConfirmModal({ isOpen: false, item: null, action: null })}
                confirmText={confirmModal.confirmText}
            />
            {isViewModalOpen && ( <ViewImportSlipModal slip={selectedSlip} onClose={() => setIsViewModalOpen(false)} /> )}
            {isEditModalOpen && ( <EditImportSlipModal slip={selectedSlip} onClose={() => setIsEditModalOpen(false)} onSave={handleSaveSlipChanges} /> )}
            
            <div className="page-header">
                <h1>Danh sách Phiếu Nhập Kho</h1>
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
                            className="search-input" // Tái sử dụng style có sẵn
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
                            className="search-input" // Tái sử dụng style có sẵn
                            isClearable
                        />
                    </div>
                </div>
                <div className="form-row" style={{ marginTop: '15px' }}>
                    <div className="form-group">
                        <label>Nhà cung cấp</label>
                        <SupplierAutocomplete 
                            value={filters.supplier.name}
                            onSelect={(supplier) => handleFilterChange('supplier', supplier)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Trạng thái</label>
                        <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
                            <option value="all">Tất cả trạng thái</option>
                            <option value="pending">Đang chờ</option>
                            <option value="completed">Hoàn thành</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* NÂNG CẤP 1: HIỂN THỊ CÁC THẺ THỐNG KÊ */}
            <div className="stats-grid" style={{ marginBottom: '20px' }}>
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
            </div>

            <NewDataNotification
                isVisible={hasNewData}
                onRefresh={handleRefresh}
                message="Có phiếu nhập mới!"
            />

            {loading ? <Spinner /> : (
                <>
                    <table className="products-table list-page-table">
<thead>
                            <tr>
                                <th>Ngày tạo</th>
                                <th>Nhà cung cấp</th>
                                <th>Diễn giải</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
{importSlips.length > 0 ? importSlips.map(slip => (
                                <tr key={slip.id}>
                                   <td>{formatDate(slip.createdAt)}</td>
                                    <td>{slip.supplierName}</td>
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
                                                    <button className="btn-icon btn-delete" title="Xóa phiếu" onClick={() => promptForDelete(slip)}>
                                                        <FiTrash2 />
                                                    </button>
                                                    <button 
    className="btn-icon btn-confirm" 
    title="Xác nhận nhập kho" 
    onClick={() => promptForConfirm(slip)}
    disabled={isProcessing} // <-- THÊM DÒNG NÀY
>
    <FiCheckCircle />
</button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
)) : (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center' }}>Không tìm thấy phiếu nhập nào khớp với điều kiện.</td>
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

export default ImportListPage;
