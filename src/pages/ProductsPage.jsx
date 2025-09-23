// src/pages/ProductsPage.jsx
import React, { useState, useMemo } from 'react';
import { collection, query, orderBy, where, documentId } from 'firebase/firestore';
import { FiEdit, FiTrash2, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { db } from '../firebaseConfig';
import { PAGE_SIZE } from '../constants';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import { useRealtimeNotification } from '../hooks/useRealtimeNotification';
import { deleteProduct } from '../services/productService';
import AddProductModal from '../components/AddProductModal';
import EditProductModal from '../components/EditProductModal';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import NewDataNotification from '../components/NewDataNotification';
import HighlightText from '../components/HighlightText';

const ProductsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });

  const baseQuery = useMemo(() => {
    // Sắp xếp theo 'createdAt' để luôn lấy được sản phẩm mới nhất lên đầu
    let q = query(collection(db, 'products'));
    if (searchTerm) {
        // Tìm kiếm vẫn dùng documentId vì hiệu quả hơn
        const upperSearchTerm = searchTerm.toUpperCase();
        q = query(collection(db, 'products'), where(documentId(), '>=', upperSearchTerm), where(documentId(), '<=', upperSearchTerm + '\uf8ff'));
    }
    return q;
  }, [searchTerm]);

  const {
    documents: products,
    loading,
    isLastPage,
    page,
    nextPage,
    prevPage,
    reset,
  } = useFirestorePagination(baseQuery, PAGE_SIZE);

  const { hasNewData, setHasNewData } = useRealtimeNotification(baseQuery, products, page, searchTerm);

  const handleRefresh = () => {
      dismissNewData();
      reset();
  };

  const handleProductAdded = () => {
    setIsAddModalOpen(false);
    // Nếu đang tìm kiếm thì xóa tìm kiếm để thấy sản phẩm mới, nếu không thì reset
    if (searchTerm) setSearchTerm('');
    else reset();
  };

  const handleProductUpdated = () => {
    setIsEditModalOpen(false);
    reset();
  };

  const promptForDelete = (product) => {
    setConfirmModal({
        isOpen: true,
        item: product,
        title: "Xác nhận xóa sản phẩm?",
        message: `Bạn có chắc chắn muốn xóa "${product.productName}" (ID: ${product.id}) không?`
    });
  };

  const handleDelete = async () => {
    const { item } = confirmModal;
    if (!item) return;
    try {
        await deleteProduct(item.id);
        toast.success('Xóa sản phẩm thành công!');
        if (searchTerm) setSearchTerm('');
        else reset();
    } catch (error) {
        console.error("Lỗi khi xóa sản phẩm: ", error);
        toast.error('Đã xảy ra lỗi khi xóa sản phẩm.');
    } finally {
        setConfirmModal({ isOpen: false, item: null });
    }
  };

  const openEditModal = (product) => {
    setCurrentProduct(product);
    setIsEditModalOpen(true);
  };

  return (
    <div className="products-page-container">
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={handleDelete}
        onCancel={() => setConfirmModal({ isOpen: false, item: null })}
        confirmText="Vẫn xóa"
      />

      <div className="page-header">
        <h1>Quản Lý Hàng Hóa</h1>
        <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">Thêm sản phẩm</button>
      </div>

      <div className="controls-container" style={{justifyContent: 'flex-start'}}>
        <div className="search-container" style={{maxWidth: '400px'}}>
            <input
                type="text"
                placeholder="Tìm theo Mã hàng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
            />
        </div>
      </div>
      
      {isAddModalOpen && <AddProductModal onClose={() => setIsAddModalOpen(false)} onProductAdded={handleProductAdded} />}
      {isEditModalOpen && <EditProductModal onClose={() => setIsEditModalOpen(false)} onProductUpdated={handleProductUpdated} productToEdit={currentProduct} />}
      
      <NewDataNotification
        isVisible={hasNewData}
        onRefresh={handleRefresh}
        message="Có sản phẩm mới được thêm!"
      />

      {loading ? <Spinner /> : (
        <>
          <table className="products-table">
            <thead>
              <tr>
                <th>Mã hàng</th>
                <th>Tên hàng</th>
                <th>Đơn vị tính</th>
                <th>Quy cách đóng gói</th>
                <th>Nhiệt độ BQ</th>
                <th>Hãng sản xuất</th>
                <th>Team</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            {/* Dán đoạn mã này để thay thế cho toàn bộ khối <tbody> hiện tại trong file ProductsPage.jsx */}
<tbody>
  {products.length > 0 ? (
      products.map(product => (
      <tr key={product.id}>
        <td>
            {/* Highlight Mã hàng */}
            <HighlightText text={product.id} highlight={searchTerm} />
        </td>
        <td>
            {/* Highlight Tên hàng */}
            <HighlightText text={product.productName} highlight={searchTerm} />
        </td>
        <td>{product.unit}</td>
        <td>{product.packaging}</td>
        <td>{product.storageTemp}</td>
        <td>{product.manufacturer}</td>
        <td>{product.team}</td>
        <td>
          <div className="action-buttons">
            <button className="btn-icon btn-edit" onClick={() => openEditModal(product)}>
              <FiEdit />
            </button>
            <button className="btn-icon btn-delete" onClick={() => promptForDelete(product)}>
              <FiTrash2 />
            </button>
          </div>
        </td>
      </tr>
    ))
  ) : (
      <tr>
          <td colSpan="8" style={{textAlign: 'center'}}>
            Không tìm thấy sản phẩm nào.
          </td>
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

export default ProductsPage;