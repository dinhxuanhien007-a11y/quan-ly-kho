// src/pages/ProductsPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import AddProductModal from '../components/AddProductModal';
import EditProductModal from '../components/EditProductModal'; // Import Edit Modal
import { FiEdit, FiTrash2 } from 'react-icons/fi';

const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // State mới để quản lý việc sửa sản phẩm
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);

  const fetchProducts = async () => {
    // ... code fetchProducts giữ nguyên ...
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

  const handleDelete = async (productId, productName) => {
    // ... code handleDelete giữ nguyên ...
    if (window.confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${productName}" (ID: ${productId}) không?`)) {
      try {
        await deleteDoc(doc(db, 'products', productId));
        alert('Xóa sản phẩm thành công!');
        fetchProducts();
      } catch (error) {
        console.error("Lỗi khi xóa sản phẩm: ", error);
        alert('Đã xảy ra lỗi khi xóa sản phẩm.');
      }
    }
  };

  // Hàm để mở modal Sửa
  const openEditModal = (product) => {
    setCurrentProduct(product);
    setIsEditModalOpen(true);
  };

  if (loading) {
    return <div>Đang tải dữ liệu sản phẩm...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Quản Lý Hàng Hóa</h1>
        <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">Thêm sản phẩm</button>
      </div>
      <p>Tổng cộng có {products.length} mã hàng.</p>

      {isAddModalOpen && <AddProductModal onClose={() => setIsAddModalOpen(false)} onProductAdded={handleProductAdded} />}
      {isEditModalOpen && <EditProductModal onClose={() => setIsEditModalOpen(false)} onProductUpdated={handleProductUpdated} productToEdit={currentProduct} />}

      <table className="products-table">
        {/* ... thead giữ nguyên ... */}
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
                  {/* GỌI HÀM openEditModal KHI NHẤN NÚT SỬA */}
                  <button className="btn-icon btn-edit" onClick={() => openEditModal(product)}>
                    <FiEdit />
                  </button>
                  <button className="btn-icon btn-delete" onClick={() => handleDelete(product.id, product.productName)}>
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