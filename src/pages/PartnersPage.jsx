// src/pages/PartnersPage.jsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, doc, deleteDoc, getDocs, where, documentId } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { FiPlus, FiEdit, FiTrash2, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import AddPartnerModal from '../components/AddPartnerModal';
import EditPartnerModal from '../components/EditPartnerModal';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import { PAGE_SIZE } from '../constants';
import { normalizeString } from '../utils/stringUtils'; // <-- THÊM DÒNG NÀY
import HighlightText from '../components/HighlightText';

const PartnersPage = () => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [partnerToEdit, setPartnerToEdit] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [forceRerender, setForceRerender] = useState(0); // State để trigger re-fetch

    // MỚI: State cho chức năng tìm kiếm
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState(null); // null: không tìm kiếm, []: tìm không thấy, [...]: kết quả
    const [isSearching, setIsSearching] = useState(false);

    const baseQuery = useMemo(() => {
        return query(collection(db, "partners"), orderBy(documentId()));
    }, [forceRerender]); // Phụ thuộc vào forceRerender

    const {
        documents: partners,
        loading,
        isLastPage,
        page,
        nextPage,
        prevPage
    } = useFirestorePagination(baseQuery, PAGE_SIZE);

    // THAY THẾ TOÀN BỘ HÀM CŨ BẰNG HÀM MỚI NÀY
const performSearch = useCallback(async (term) => {
    if (!term.trim()) {
        setSearchResults(null);
        return;
    }
    setIsSearching(true);
    try {
        // Bước 1: Chuẩn hóa và tách tất cả các từ người dùng gõ
        const searchTerms = normalizeString(term).split(' ').filter(t => t);

        if (searchTerms.length === 0) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        // Bước 2: Dùng từ đầu tiên để truy vấn Firestore (lấy về các kết quả tiềm năng)
        const firstTerm = searchTerms[0];
        const q = query(
            collection(db, "partners"),
            where("searchKeywords", "array-contains", firstTerm)
        );

        const querySnapshot = await getDocs(q);
        const initialResults = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Bước 3: Lọc kết quả trên client để khớp với TẤT CẢ các từ còn lại
        if (searchTerms.length > 1) {
            const remainingTerms = searchTerms.slice(1);
            const finalResults = initialResults.filter(partner => 
                // Kiểm tra xem 'searchKeywords' của đối tác có chứa MỌI từ còn lại không
                remainingTerms.every(t => partner.searchKeywords.includes(t))
            );
            setSearchResults(finalResults);
        } else {
            // Nếu chỉ gõ 1 từ thì không cần lọc thêm
            setSearchResults(initialResults);
        }

    } catch (error) {
        console.error("Lỗi khi tìm kiếm đối tác:", error);
        toast.error("Không thể thực hiện tìm kiếm.");
    } finally {
        setIsSearching(false);
    }
}, []);

    // MỚI: useEffect để trigger tìm kiếm sau khi người dùng ngừng gõ
    useEffect(() => {
        const debounce = setTimeout(() => {
            performSearch(searchTerm);
        }, 500); // Đợi 500ms sau khi ngừng gõ
        return () => clearTimeout(debounce);
    }, [searchTerm, performSearch]);

    const handlePartnerAdded = () => {
        setIsAddModalOpen(false);
        setForceRerender(prev => prev + 1); // Trigger re-fetch
    };

    const handlePartnerUpdated = () => {
        setIsEditModalOpen(false);
        setPartnerToEdit(null);
        if (searchResults) {
            performSearch(searchTerm); // Cập nhật lại kết quả tìm kiếm
        } else {
            setForceRerender(prev => prev + 1); // Trigger re-fetch
        }
    };

    const handleDelete = (partnerId, partnerName) => {
        setConfirmModal({
            isOpen: true,
            title: `Xác nhận xóa Đối tác?`,
            message: `Bạn có chắc chắn muốn xóa "${partnerName}" (Mã: ${partnerId})? Hành động này không thể hoàn tác.`,
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, 'partners', partnerId));
                    toast.success(`Đã xóa đối tác "${partnerName}" thành công.`);
                    setConfirmModal({ isOpen: false });
                    if (searchResults) {
                        performSearch(searchTerm);
                    } else {
                        setForceRerender(prev => prev + 1);
                    }
                } catch (error) {
                    console.error("Lỗi khi xóa đối tác:", error);
                    toast.error("Đã xảy ra lỗi khi xóa đối tác.");
                }
            }
        });
    };

    const dataToShow = searchResults !== null ? searchResults : partners;
    const isLoadingData = loading || isSearching;

    return (
        <div>
            {isAddModalOpen && <AddPartnerModal onClose={() => setIsAddModalOpen(false)} onPartnerAdded={handlePartnerAdded} />}
            {isEditModalOpen && <EditPartnerModal onClose={() => setIsEditModalOpen(false)} onPartnerUpdated={handlePartnerUpdated} partnerToEdit={partnerToEdit} />}
            <ConfirmationModal 
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal({ isOpen: false })}
            />

            <div className="page-header">
                <h1>Quản Lý Đối Tác</h1>
                <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
                    <FiPlus /> Thêm đối tác
                </button>
            </div>

            {/* MỚI: Ô tìm kiếm */}
            <div className="controls-container">
                <div className="search-container" style={{ maxWidth: '100%', flexGrow: 1 }}>
                    <input
                        type="text"
                        placeholder="Tìm theo Tên đối tác..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            {isLoadingData ? <Spinner /> : (
                <>
                    <table className="products-table list-page-table">
                        <thead>
                            <tr>
                                <th>Mã Đối Tác</th>
                                <th>Tên Đối Tác</th>
                                <th>Phân Loại</th>
                                <th>Thao Tác</th>
                            </tr>
                        </thead>
                        {/* Dán đoạn mã này để thay thế cho toàn bộ khối <tbody> hiện tại trong file PartnersPage.jsx */}
<tbody>
    {dataToShow.length > 0 ? (
        dataToShow.map(partner => (
            <tr key={partner.id}>
                <td>{partner.id}</td>
                <td style={{ textAlign: 'left' }}>
                    {/* Sử dụng component HighlightText để làm nổi bật kết quả tìm kiếm */}
                    <HighlightText text={partner.partnerName} highlight={searchTerm} />
                </td>
                <td>{partner.partnerType === 'supplier' ? 'Nhà Cung Cấp' : 'Khách Hàng'}</td>
                <td>
                    <div className="action-buttons">
                        <button className="btn-icon btn-edit" onClick={() => { setPartnerToEdit(partner); setIsEditModalOpen(true); }}>
                            <FiEdit />
                        </button>
                        <button className="btn-icon btn-delete" onClick={() => handleDelete(partner.id, partner.partnerName)}>
                            <FiTrash2 />
                        </button>
                    </div>
                </td>
            </tr>
        ))
    ) : (
        <tr>
            <td colSpan="4">Không tìm thấy đối tác nào.</td>
        </tr>
    )}
</tbody>
                    </table>

                    {/* Chỉ hiển thị phân trang khi không có tìm kiếm */}
                    {searchResults === null && (
                         <div className="pagination-controls">
                            <button onClick={prevPage} disabled={page <= 1}>
                                <FiChevronLeft /> Trang Trước
                            </button>
                            <span>Trang {page}</span>
                            <button onClick={nextPage} disabled={isLastPage}>
                                Trang Tiếp <FiChevronRight />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default PartnersPage;