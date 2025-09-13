// src/pages/ProductsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, doc, deleteDoc, query, orderBy, where, limit, startAfter, documentId } from 'firebase/firestore';
import AddProductModal from '../components/AddProductModal';
import EditProductModal from '../components/EditProductModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { FiEdit, FiTrash2, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-toastify';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 15;

const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastVisible, setLastVisible] = useState(null);
  const [firstVisible, setFirstVisible] = useState(null);
  const [page, setPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);

  const fetchProducts = useCallback(async (direction = 'next') => {
    setLoading(true);
    try {
      let productsQuery = query(collection(db, 'products'), orderBy(documentId()));

      if (searchTerm) {
        productsQuery = query(productsQuery, 
          where(documentId(), '>=', searchTerm.toUpperCase()),
          where(documentId(), '<=', searchTerm.toUpperCase() + '\uf8ff')
        );
      }
      
      if (direction === 'next' && lastVisible) {
        productsQuery = query(productsQuery, startAfter(lastVisible), limit(PAGE_SIZE));
      } else if (direction === 'prev' && firstVisible) {
        productsQuery = query(productsQuery, limit(PAGE_SIZE));
        setPage(1);
      } else {
        productsQuery = query(productsQuery, limit(PAGE_SIZE));
      }

      const documentSnapshots = await getDocs(productsQuery);
      const productsList = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setLastVisible(documentSnapshots.docs[documentSnapshots.docs.length - 1]);
      setFirstVisible(documentSnapshots.docs[0]);
      setIsLastPage(documentSnapshots.docs.length < PAGE_SIZE);
      setProducts(productsList);

    } catch (error) {
      console.error("Lỗi khi lấy danh sách sản phẩm: ", error);
      toast.error("Không thể tải danh sách sản phẩm. Có thể bạn cần tạo chỉ mục (index) trên Firestore. Vui lòng kiểm tra console log trên trình duyệt.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, lastVisible, firstVisible]);

  useEffect(() => {
    setLastVisible(null);
    setFirstVisible(null);
    setPage(1);
    
    const delayDebounceFn = setTimeout(() => {
      fetchProducts();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleNextPage = () => {
    if (!isLastPage) {
      setPage(prev => prev + 1);
      fetchProducts('next');
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setLastVisible(null);
      setFirstVisible(null);
      setPage(1);
      fetchProducts('first');
    }
  };

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });
  
  const handleProductAdded = () => { 
    setIsAddModalOpen(false);
    setLastVisible(null);
    setFirstVisible(null);
    setPage(1);
    fetchProducts('first');
  };
  
  const handleProductUpdated = () => { 
    setIsEditModalOpen(false);
    fetchProducts('first');
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
      await deleteDoc(doc(db, 'products', item.id));
      toast.success('Xóa sản phẩm thành công!');
      setLastVisible(null);
      setFirstVisible(null);
      setPage(1);
      fetchProducts('first');
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
      
      {loading ? (
        <Spinner />
      ) : (
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
            <tbody>
              {products.length > 0 ? (
                  products.map(product => (
                  <tr key={product.id}>
                    <td>{product.id}</td>
                    <td>{product.productName}</td>
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

export default ProductsPage;