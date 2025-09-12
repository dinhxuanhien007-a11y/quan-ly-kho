// src/pages/PartnersPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { FiEdit, FiTrash2, FiPlus } from 'react-icons/fi';
import AddPartnerModal from '../components/AddPartnerModal';
import EditPartnerModal from '../components/EditPartnerModal';
import ConfirmationModal from '../components/ConfirmationModal'; // Import
import { toast } from 'react-toastify';

const PartnersPage = () => {
    const [partners, setPartners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentPartner, setCurrentPartner] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null }); // State mới

    const fetchPartners = async () => {
        setLoading(true);
        try {
            const partnersCollection = collection(db, 'partners');
            const querySnapshot = await getDocs(partnersCollection);
            const partnersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPartners(partnersList.sort((a, b) => a.id.localeCompare(b.id)));
        } catch (error) {
            console.error("Lỗi khi lấy danh sách đối tác: ", error);
            toast.error("Không thể tải danh sách đối tác.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPartners(); }, []);

    const handlePartnerAdded = () => {
        setIsAddModalOpen(false);
        fetchPartners();
    };

    const handlePartnerUpdated = () => {
        setIsEditModalOpen(false);
        fetchPartners();
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
            fetchPartners();
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

    if (loading) {
        return <div>Đang tải dữ liệu đối tác...</div>;
    }

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
            <p>Tổng cộng có {partners.length} đối tác (Nhà cung cấp & Khách hàng).</p>

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
        </div>
    );
};

export default PartnersPage;