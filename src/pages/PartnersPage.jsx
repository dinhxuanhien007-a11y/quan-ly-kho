// src/pages/PartnersPage.jsx

import React, { useState, useMemo } from 'react';
import { collection, query, orderBy, documentId } from 'firebase/firestore';
import { FiEdit, FiTrash2, FiPlus, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { db } from '../firebaseConfig';
import { PAGE_SIZE } from '../constants';
import { useFirestorePagination } from '../hooks/useFirestorePagination';

// Import service để xử lý logic nghiệp vụ
import { deletePartner } from '../services/partnerService';
import AddPartnerModal from '../components/AddPartnerModal';
import EditPartnerModal from '../components/EditPartnerModal';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';

// ======================= BƯỚC 1: IMPORT CSS MODULE =======================
import styles from './PartnersPage.module.css';
// =========================================================================

const PartnersPage = () => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentPartner, setCurrentPartner] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });
    const baseQuery = useMemo(() => query(collection(db, 'partners'), orderBy(documentId())), []);
    const { 
        documents: partners, 
        loading, 
        isLastPage, 
        page, 
        nextPage, 
        prevPage,
        reset
    } = useFirestorePagination(baseQuery, PAGE_SIZE);

    const handlePartnerAdded = () => {
        setIsAddModalOpen(false);
        reset();
    };
    const handlePartnerUpdated = () => {
        setIsEditModalOpen(false);
        reset();
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
            await deletePartner(item.id);
            toast.success('Xóa đối tác thành công!');
            reset();
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
                                    {/* ================ BƯỚC 2: SỬ DỤNG CLASS TỪ MODULE ================ */}
                                    <td className={styles.partnerIdCell}>{partner.id}</td>
                                    <td>{partner.partnerName}</td>
                                    <td className={styles.partnerTypeCell}>
                                        {partner.partnerType === 'supplier' ? 'Nhà Cung Cấp' : 'Khách Hàng'}
                                    </td>
                                    {/* ================================================================= */}
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

export default PartnersPage;