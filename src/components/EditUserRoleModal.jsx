// src/components/EditUserRoleModal.jsx

import React, { useState } from 'react';
import { toast } from 'react-toastify';

const EditUserRoleModal = ({ user, onClose, onRoleUpdated }) => {
  const [newRole, setNewRole] = useState(user.role);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (newRole === user.role) {
      onClose();
      return;
    }
    setIsSaving(true);
    // Gọi hàm callback từ UsersPage để xử lý cập nhật role
    await onRoleUpdated(user.uid, newRole);
    setIsSaving(false);
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