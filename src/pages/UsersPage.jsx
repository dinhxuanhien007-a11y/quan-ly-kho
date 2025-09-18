// src/pages/UsersPage.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, doc, deleteDoc } from 'firebase/firestore'; // MỚI: Thêm doc, deleteDoc
import Spinner from '../components/Spinner';
import EditUserRoleModal from '../components/EditUserRoleModal';
import AddUserModal from '../components/AddUserModal';
import ConfirmationModal from '../components/ConfirmationModal'; // MỚI
import { useAuth } from '../context/UserContext';
import { FiEdit, FiPlus, FiTrash2 } from 'react-icons/fi'; // MỚI
import { toast } from 'react-toastify'; // MỚI

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // MỚI: State cho modal xác nhận xóa
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });


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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // MỚI: Hàm xử lý xóa user
  const handleDeleteUser = async () => {
    const userToDelete = confirmModal.item;
    if (!userToDelete) return;
    
    try {
        const userRef = doc(db, 'users', userToDelete.uid);
        await deleteDoc(userRef);
        toast.success(`Đã xóa user ${userToDelete.uid} thành công.`);
        fetchUsers(); // Tải lại danh sách
    } catch (error) {
        console.error("Lỗi khi xóa user: ", error);
        toast.error("Đã xảy ra lỗi khi xóa user.");
    } finally {
        setConfirmModal({ isOpen: false, item: null }); // Đóng modal sau khi xử lý
    }
  };

  // MỚI: Hàm mở modal xác nhận xóa
  const promptForDelete = (user) => {
    setConfirmModal({
        isOpen: true,
        item: user,
        title: "Xác nhận xóa User?",
        message: `Bạn có chắc chắn muốn xóa user có UID: ${user.uid}? Thao tác này sẽ thu hồi mọi quyền của họ.`,
        onConfirm: handleDeleteUser,
        confirmText: "Vẫn xóa"
    });
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleRoleUpdated = () => {
    setIsEditModalOpen(false);
    fetchUsers();
  };

  const handleUserAdded = () => {
    setIsAddModalOpen(false);
    fetchUsers();
  }

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
        onCancel={() => setConfirmModal({ isOpen: false, item: null })}
        confirmText={confirmModal.confirmText}
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
        <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
            <FiPlus style={{ marginRight: '5px' }} />
            Thêm User
        </button>
      </div>
      
      <table className="products-table">
        <thead>
          <tr>
            <th>User ID (UID)</th>
            <th>Vai trò (Role)</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {users.length > 0 ? (
            users.map(user => (
              <tr key={user.uid}>
                <td>{user.uid}</td>
                <td>
                  <span className={`status-badge ${user.role === 'owner' ? 'status-completed' : 'status-pending'}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn-icon btn-edit" 
                      title="Sửa vai trò"
                      onClick={() => openEditModal(user)}
                      disabled={user.uid === currentUser.uid}
                    >
                      <FiEdit />
                    </button>
                    {/* MỚI: Thêm nút xóa */}
                    <button 
                      className="btn-icon btn-delete" 
                      title="Xóa User"
                      onClick={() => promptForDelete(user)}
                      disabled={user.uid === currentUser.uid}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="3" style={{ textAlign: 'center' }}>Không tìm thấy user nào.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default UsersPage;