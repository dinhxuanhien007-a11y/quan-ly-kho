// src/components/EditAllowedUserModal.jsx
import React, { useState } from 'react';
import { functions } from '../firebaseConfig'; // <-- THÊM: Import functions đã cấu hình
import { httpsCallable } from "firebase/functions"; // <-- GIỮ LẠI
import { toast } from 'react-toastify';

const EditAllowedUserModal = ({ onClose, onUserUpdated, userToEdit }) => {
  const [newRole, setNewRole] = useState(userToEdit.role);
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = async () => {
    if (newRole === userToEdit.role) {
        onClose();
        return;
    }
    setIsSaving(true);
    try {
      const updateRoleFunc = httpsCallable(functions, 'updateAllowlistRole');
      await updateRoleFunc({ email: userToEdit.email, newRole: newRole });
      toast.success(`Đã cập nhật vai trò cho ${userToEdit.email}!`);
      onUserUpdated();
      onClose();
    } catch (error) {
      console.error("Lỗi khi cập nhật vai trò:", error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{width: '500px'}}>
        <h2>Chỉnh sửa vai trò</h2>
        <div className="form-group">
            <label>Email của User</label>
            <input type="email" value={userToEdit.email} readOnly disabled />
        </div>
        <div className="form-group">
            <label>Chọn vai trò mới (*)</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="med">med</option>
                <option value="bio">bio</option>
                <option value="admin">admin</option>
            </select>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
          <button type="button" onClick={handleUpdate} className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditAllowedUserModal;