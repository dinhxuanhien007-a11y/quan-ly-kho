// src/pages/UsersPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy } from 'firebase/firestore'; 
import Spinner from '../components/Spinner';
import { FiPlus, FiTrash2, FiEdit } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { getFunctions, httpsCallable } from "firebase/functions";
import ConfirmationModal from '../components/ConfirmationModal';
import AddAllowedUserModal from '../components/AddAllowedUserModal';
import EditAllowedUserModal from '../components/EditAllowedUserModal'; // <-- 1. Import modal mới

const UsersPage = () => {
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  // --- 2. Thêm state cho việc chỉnh sửa ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);

  const fetchAllowedUsers = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "allowlist"), orderBy("addedAt", "desc"));
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllowedUsers(list);
    } catch (error) {
      console.error("Lỗi khi tải danh sách cho phép: ", error);
      toast.error("Không thể tải danh sách cho phép.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllowedUsers();
  }, [fetchAllowedUsers]);
  
  // --- 3. Hàm để mở modal chỉnh sửa ---
  const openEditModal = (user) => {
    setUserToEdit(user);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (user) => {
    setConfirmModal({ isOpen: false });
    toast.info(`Đang xóa ${user.email}...`);
    try {
        const functions = getFunctions();
        const deleteFunc = httpsCallable(functions, 'deleteUserAndAllowlist');
        // Cần tìm UID tương ứng nếu có để xóa triệt để
        // Logic này có thể được cải thiện thêm, nhưng hiện tại sẽ xóa khỏi allowlist trước
        await deleteFunc({ email: user.email });
        toast.success(`Đã xóa ${user.email} khỏi danh sách.`);
        fetchAllowedUsers();
    } catch (error) {
        console.error("Lỗi khi xóa:", error);
        toast.error(error.message);
    }
  };

  const promptForDelete = (user) => {
    setConfirmModal({
        isOpen: true,
        title: "Xác nhận xóa?",
        message: `Bạn có chắc muốn xóa ${user.email} khỏi danh sách được phép truy cập không?`,
        onConfirm: () => handleDelete(user),
        confirmText: "Vẫn xóa",
        confirmButtonType: 'danger'
    });
  };

  return (
    <div>
      <ConfirmationModal {...confirmModal} onCancel={() => setConfirmModal({ isOpen: false })} />
      {isAddModalOpen && <AddAllowedUserModal onClose={() => setIsAddModalOpen(false)} onUserAdded={fetchAllowedUsers} />}
      {/* --- 4. Render modal chỉnh sửa --- */}
      {isEditModalOpen && <EditAllowedUserModal onClose={() => setIsEditModalOpen(false)} onUserUpdated={fetchAllowedUsers} userToEdit={userToEdit} />}

      <div className="page-header">
        <h1>Quản lý Quyền Truy cập</h1>
        <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
            <FiPlus style={{ marginRight: '5px' }} />
            Thêm Email
        </button>
      </div>
      
      <p>Đây là danh sách các email được phép đăng nhập vào hệ thống bằng tài khoản Google của họ.</p>

      {loading ? <Spinner /> : (
        <table className="products-table">
          <thead>
            <tr>
              <th>Email</th> 
              <th>Vai trò (Role)</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {allowedUsers.length > 0 ? (
              allowedUsers.map(user => (
                <tr key={user.id}>
                  <td><strong>{user.email}</strong></td>
                  <td>
                    <span className={`status-badge ${user.role === 'owner' ? 'status-completed' : (user.role === 'admin' ? 'status-pending' : 'status-cancelled')}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                        {/* --- 5. Thêm nút sửa và logic điều kiện --- */}
                        <button 
                            className="btn-icon btn-edit" 
                            title="Chỉnh sửa vai trò"
                            onClick={() => openEditModal(user)}
                            disabled={user.role === 'owner'} // Vô hiệu hóa nút sửa cho owner
                        >
                            <FiEdit />
                        </button>
                        <button 
                            className="btn-icon btn-delete" 
                            title="Xóa quyền truy cập" 
                            onClick={() => promptForDelete(user)}
                            disabled={user.role === 'owner'} // Vô hiệu hóa nút xóa cho owner
                        >
                            <FiTrash2 />
                        </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center' }}>Chưa có email nào trong danh sách được phép.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default UsersPage;