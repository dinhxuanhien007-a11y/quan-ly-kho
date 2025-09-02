// src/pages/ProductsPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';
import AddProductModal from '../components/AddProductModal'; // Import modal

const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false); // State để quản lý việc đóng/mở modal

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);
  
  const handleProductAdded = () => {
    setIsModalOpen(false); // Đóng modal
    fetchProducts(); // Tải lại danh sách sản phẩm
  };

  if (loading) {
    return <div>Đang tải dữ liệu sản phẩm...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Quản Lý Hàng Hóa</h1>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">Thêm sản phẩm</button>
      </div>
      <p>Tổng cộng có {products.length} mã hàng.</p>

      {isModalOpen && <AddProductModal onClose={() => setIsModalOpen(false)} onProductAdded={handleProductAdded} />}

      {/* Bảng sản phẩm ... */}
      <table className="products-table">
        {/* ... thead và tbody giữ nguyên như cũ ... */}
        <thead>
          <tr>
            <th>Mã hàng</th>
            <th>Tên hàng</th>
            <th>Đơn vị tính</th>
            <th>Quy cách đóng gói</th>
            <th>Nhiệt độ BQ</th>
            <th>Hãng sản xuất</th>
            <th>Team</th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProductsPage;