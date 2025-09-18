// src/pages/UsersPage.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query } from 'firebase/firestore'; 
import Spinner from '../components/Spinner';
import EditUserRoleModal from '../components/EditUserRoleModal';
import AddUserModal from '../components/AddUserModal';
import ConfirmationModal from '../components/ConfirmationModal'; 
import { useAuth } from '../context/UserContext';
import { FiEdit, FiPlus, FiTrash2, FiRefreshCw } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { getFunctions, httpsCallable } from "firebase/functions";

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersQuery = query(collection(db, "users"));
      const querySnapshot = await getDocs(usersQuery);
      const usersList = querySnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      }));
      setUsers(usersList);
    } catch (error) {
      console.error("Lỗi khi tải danh sách user: ", error);
      toast.error("Không có quyền truy cập danh sách người dùng.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleBackfillEmails = async () => {
    setIsBackfilling(true);
    toast.info("Đang bắt đầu quá trình đồng bộ email...");
    try {
      const backfillCallable = httpsCallable(getFunctions(), 'backfillUserEmails');
      const result = await backfillCallable();
      toast.success(result.data.message);
      fetchUsers();
    } catch (error) {
      console.error("Lỗi khi chạy backfill:", error);
      toast.error(error.message);
    } finally {
      setIsBackfilling(false);
    }
  };

  const updateRoleOnBackend = async (uid, role) => {
    try {
      const setRoleCallable = httpsCallable(getFunctions(), 'setRole');
      const result = await setRoleCallable({ uid, role });
      toast.success(result.data.message);
      return true;
    } catch (error) {
      console.error("Lỗi khi cập nhật vai trò qua Cloud Function:", error);
      toast.error(error.message);
      return false;
    }
  };

  const handleDeleteUser = async (userToDelete) => {
    if (!userToDelete) return;

    setConfirmModal({ isOpen: false });
    toast.info(`Đang xóa user ${userToDelete.email}...`);

    try {
        const deleteUserCallable = httpsCallable(getFunctions(), 'deleteUser');
        await deleteUserCallable({ uid: userToDelete.uid });
        toast.success("Đã xóa user thành công khỏi toàn bộ hệ thống!");
        fetchUsers(); // Tải lại danh sách sau khi xóa
    } catch (error) {
        console.error("Lỗi khi xóa user qua Cloud Function:", error);
        toast.error(error.message);
    }
  };

  const promptForDelete = (user) => {
    if (user.uid === currentUser.uid) {
        toast.warn("Không thể xóa tài khoản của chính bạn.");
        return;
    }
    setConfirmModal({
        isOpen: true,
        title: "Xác nhận xóa User?",
        message: `Hành động này sẽ xóa vĩnh viễn tài khoản ${user.email} khỏi hệ thống. Bạn có chắc chắn không?`,
        onConfirm: () => handleDeleteUser(user), // Sửa ở đây: Truyền thẳng user vào hàm
        confirmText: "Vẫn xóa",
        confirmButtonType: 'danger'
    });
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleRoleUpdated = async (uid, newRole) => {
    const success = await updateRoleOnBackend(uid, newRole);
    if (success) {
      setIsEditModalOpen(false);
      fetchUsers();
    }
  };

  const handleUserAdded = () => {
    setIsAddModalOpen(false);
    fetchUsers();
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <div>
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false })}
        confirmText={confirmModal.confirmText}
        confirmButtonType={confirmModal.confirmButtonType}
      />

      {isAddModalOpen && (
        <AddUserModal 
            onClose={() => setIsAddModalOpen(false)}
            onUserAdded={handleUserAdded}
        />
      )}

      {isEditModalOpen && (
        <EditUserRoleModal 
            user={selectedUser}
            onClose={() => setIsEditModalOpen(false)}
            onRoleUpdated={handleRoleUpdated}
        />
      )}

      <div className="page-header">
        <h1>Quản lý User và Phân quyền</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleBackfillEmails} className="btn-secondary" disabled={isBackfilling}>
                <FiRefreshCw style={{ marginRight: '5px' }} className={isBackfilling ? 'spin-animation' : ''} />
                {isBackfilling ? 'Đang đồng bộ...' : 'Đồng bộ Email'}
            </button>
            <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
                <FiPlus style={{ marginRight: '5px' }} />
                Thêm User
            </button>
        </div>
      </div>
      
      <table className="products-table">
        <thead>
          <tr>
            <th>Email</th> 
            <th>User ID (UID)</th>
            <th>Vai trò (Role)</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {users.length > 0 ? (
            users.map(user => (
              <tr key={user.uid}>
                <td><strong>{user.email || '(Chưa có, hãy đồng bộ)'}</strong></td>
                <td>{user.uid}</td>
                <td>
                  <span className={`status-badge ${user.role === 'owner' ? 'status-completed' : (user.role === 'admin' ? 'status-pending' : 'status-cancelled')}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn-icon btn-edit" 
                      title="Sửa vai trò"
                      onClick={() => openEditModal(user)}
                      disabled={user.role === 'owner'}
                    >
                      <FiEdit />
                    </button>
                    <button 
                      className="btn-icon btn-delete" 
                      title="Xóa User"
                      onClick={() => promptForDelete(user)}
                      disabled={user.role === 'owner'}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" style={{ textAlign: 'center' }}>Không tìm thấy user nào.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default UsersPage;