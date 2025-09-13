// src/pages/ProductsPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import AddProductModal from '../components/AddProductModal';
import EditProductModal from '../components/EditProductModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { FiEdit, FiTrash2 } from 'react-icons/fi';
import { toast } from 'react-toastify';
import Spinner from '../components/Spinner'; // <-- ĐÃ THÊM

const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const productsCollection = collection(db, 'products');
      const querySnapshot = await getDocs(productsCollection);
      const productsList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(productsList);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách sản phẩm: ", error);
      toast.error("Không thể tải danh sách sản phẩm.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);
  
  const handleProductAdded = () => {
    setIsAddModalOpen(false);
    fetchProducts();
  };
  
  const handleProductUpdated = () => {
    setIsEditModalOpen(false);
    fetchProducts();
  };

  const promptForDelete = (product) => {
    setConfirmModal({
        isOpen: true,
        item: product,
        title: "Xác nhận xóa sản phẩm?",
        message: `Bạn có chắc chắn muốn xóa "${product.productName}" (ID: ${product.id}) không? Hành động này không thể hoàn tác.`
    });
  };

  const handleDelete = async () => {
    const { item } = confirmModal;
    if (!item) return;

    try {
      await deleteDoc(doc(db, 'products', item.id));
      toast.success('Xóa sản phẩm thành công!');
      fetchProducts();
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

  if (loading) {
    return <Spinner />; // <-- ĐÃ THAY THẾ
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

      <div className="page-header">
        <h1>Quản Lý Hàng Hóa</h1>
        <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">Thêm sản phẩm</button>
      </div>
      <p>Tổng cộng có {products.length} mã hàng.</p>

      {isAddModalOpen && <AddProductModal onClose={() => setIsAddModalOpen(false)} onProductAdded={handleProductAdded} />}
      {isEditModalOpen && <EditProductModal onClose={() => setIsEditModalOpen(false)} onProductUpdated={handleProductUpdated} productToEdit={currentProduct} />}

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
          {products.map(product => (
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
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProductsPage;