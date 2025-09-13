// src/pages/PartnersPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, doc, deleteDoc, query, orderBy, limit, startAfter, documentId } from 'firebase/firestore';
import { FiEdit, FiTrash2, FiPlus, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import AddPartnerModal from '../components/AddPartnerModal';
import EditPartnerModal from '../components/EditPartnerModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { toast } from 'react-toastify';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 15; // <-- SỐ ĐỐI TÁC TRÊN MỖI TRANG

const PartnersPage = () => {
    const [partners, setPartners] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // --- STATE MỚI CHO PHÂN TRANG ---
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    const [isLastPage, setIsLastPage] = useState(false);

    // --- LOGIC MỚI ĐỂ TẢI DỮ LIỆU THEO TRANG ---
    const fetchPartners = useCallback(async (direction = 'next') => {
        setLoading(true);
        try {
            let partnersQuery = query(collection(db, 'partners'), orderBy(documentId()), limit(PAGE_SIZE));

            if (direction === 'next' && lastVisible) {
                partnersQuery = query(collection(db, 'partners'), orderBy(documentId()), startAfter(lastVisible), limit(PAGE_SIZE));
            } else if (direction === 'first') {
                partnersQuery = query(collection(db, 'partners'), orderBy(documentId()), limit(PAGE_SIZE));
                setPage(1);
            }
            
            const querySnapshot = await getDocs(partnersQuery);
            const partnersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
            setIsLastPage(querySnapshot.docs.length < PAGE_SIZE);
            setPartners(partnersList);
        } catch (error) {
            console.error("Lỗi khi lấy danh sách đối tác: ", error);
            toast.error("Không thể tải danh sách đối tác.");
        } finally {
            setLoading(false);
        }
    }, [lastVisible]);

    useEffect(() => {
        fetchPartners('first');
    }, []);

    // --- CÁC HÀM XỬ LÝ SỰ KIỆN PHÂN TRANG ---
    const handleNextPage = () => {
        if (!isLastPage) {
            setPage(prev => prev + 1);
            fetchPartners('next');
        }
    };

    const handlePrevPage = () => {
        // Cách làm đơn giản nhất là quay về trang đầu
        setLastVisible(null);
        setPage(1);
        fetchPartners('first');
    };
    
    // --- CÁC HÀM CŨ (CÓ CẬP NHẬT ĐỂ TẢI LẠI TRANG ĐẦU) ---
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentPartner, setCurrentPartner] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });

    const handlePartnerAdded = () => {
        setIsAddModalOpen(false);
        setLastVisible(null);
        fetchPartners('first');
    };

    const handlePartnerUpdated = () => {
        setIsEditModalOpen(false);
        fetchPartners('first');
    };

    const promptForDelete = (partner) => {
        setConfirmModal({
            isOpen: true,
            item: partner,
            title: "Xác nhận xóa đối tác?",
            message: `Bạn có chắc chắn muốn xóa "${partner.partnerName}" (ID: ${partner.id}) không?`
        });
    };

    const handleDelete = async () => {
        const { item } = confirmModal;
        if (!item) return;
        try {
            await deleteDoc(doc(db, 'partners', item.id));
            toast.success('Xóa đối tác thành công!');
            setLastVisible(null);
            fetchPartners('first');
        } catch (error) {
            console.error("Lỗi khi xóa đối tác: ", error);
            toast.error('Đã xảy ra lỗi khi xóa đối tác.');
        } finally {
            setConfirmModal({ isOpen: false, item: null });
        }
    };

    const openEditModal = (partner) => {
        setCurrentPartner(partner);
        setIsEditModalOpen(true);
    };

    return (
        <div>
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={handleDelete}
                onCancel={() => setConfirmModal({ isOpen: false, item: null })}
                confirmText="Vẫn xóa"
            />
            {isAddModalOpen && <AddPartnerModal onClose={() => setIsAddModalOpen(false)} onPartnerAdded={handlePartnerAdded} />}
            {isEditModalOpen && <EditPartnerModal onClose={() => setIsEditModalOpen(false)} onPartnerUpdated={handlePartnerUpdated} partnerToEdit={currentPartner} />}

            <div className="page-header">
                <h1>Quản Lý Đối Tác</h1>
                <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
                    <FiPlus style={{ marginRight: '5px' }} />
                    Thêm Đối Tác
                </button>
            </div>
            
            {loading ? <Spinner /> : (
                <>
                    <table className="products-table">
                        <thead>
                            <tr>
                                <th>Mã Đối Tác</th>
                                <th>Tên Đối Tác</th>
                                <th>Phân Loại</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {partners.map(partner => (
                                <tr key={partner.id}>
                                    <td><strong>{partner.id}</strong></td>
                                    <td>{partner.partnerName}</td>
                                    <td>{partner.partnerType === 'supplier' ? 'Nhà Cung Cấp' : 'Khách Hàng'}</td>
                                    <td>
                                        <div className="action-buttons">
                                            <button className="btn-icon btn-edit" onClick={() => openEditModal(partner)}>
                                                <FiEdit />
                                            </button>
                                            <button className="btn-icon btn-delete" onClick={() => promptForDelete(partner)}>
                                                <FiTrash2 />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* --- KHỐI PHÂN TRANG MỚI --- */}
                    <div className="pagination-controls">
                        <button onClick={handlePrevPage} disabled={page <= 1}>
                            <FiChevronLeft /> Trang Trước
                        </button>
                        <span>Trang {page}</span>
                        <button onClick={handleNextPage} disabled={isLastPage}>
                            Trang Tiếp <FiChevronRight />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default PartnersPage;