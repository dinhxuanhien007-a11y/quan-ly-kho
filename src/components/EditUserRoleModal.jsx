// src/components/EditUserRoleModal.jsx

import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';

const EditUserRoleModal = ({ user, onClose, onRoleUpdated }) => {
  // State để lưu vai trò mới được chọn trong dropdown
  const [newRole, setNewRole] = useState(user.role);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (newRole === user.role) {
      onClose(); // Nếu không có gì thay đổi thì chỉ cần đóng lại
      return;
    }
    setIsSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        role: newRole
      });
      toast.success(`Cập nhật vai trò cho user ${user.uid} thành công!`);
      onRoleUpdated(); // Gọi hàm callback để tải lại danh sách và đóng modal
    } catch (error) {
      console.error("Lỗi khi cập nhật vai trò: ", error);
      toast.error("Đã xảy ra lỗi khi cập nhật vai trò.");
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{width: '450px'}}>
        <h2>Thay đổi vai trò</h2>
        <div className="form-group">
            <label>User ID (UID)</label>
            <p><strong>{user.uid}</strong></p>
        </div>
        <div className="form-group">
            <label>Vai trò hiện tại</label>
            <p><em>{user.role}</em></p>
        </div>
        <div className="form-group">
            <label>Chọn vai trò mới</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="admin">admin</option>
                <option value="med">med</option>
                <option value="bio">bio</option>
                {/* Không cho phép đổi vai trò thành 'owner' trực tiếp từ giao diện */}
            </select>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
          <button type="button" onClick={handleSave} className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditUserRoleModal;