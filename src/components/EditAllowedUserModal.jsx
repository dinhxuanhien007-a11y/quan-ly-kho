// src/components/EditAllowedUserModal.jsx
import React, { useState } from 'react';
import { functions, auth } from '../firebaseConfig';
import { httpsCallable } from "firebase/functions";
import { toast } from 'react-toastify';

const EditAllowedUserModal = ({ onClose, onUserUpdated, userToEdit }) => {
  const [newRole, setNewRole] = useState(userToEdit.role);
  const [canReconcile, setCanReconcile] = useState(userToEdit.canReconcile === true);
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = async () => {
    const roleChanged = newRole !== userToEdit.role;
    const reconcileChanged = newRole === 'admin' && canReconcile !== (userToEdit.canReconcile === true);

    if (!roleChanged && !reconcileChanged) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      // Cập nhật role nếu có thay đổi
      if (roleChanged) {
        const updateRoleFunc = httpsCallable(functions, 'updateAllowlistRole');
        await updateRoleFunc({ email: userToEdit.email, newRole });
      }

      // Cập nhật canReconcile nếu role là admin và có thay đổi
      if (newRole === 'admin' && reconcileChanged) {
        const setCanReconcileFunc = httpsCallable(functions, 'setCanReconcile');
        await setCanReconcileFunc({ email: userToEdit.email, canReconcile });
      }

      // Nếu đang chỉnh sửa chính mình, force refresh token để áp dụng ngay
      if (auth.currentUser?.email === userToEdit.email) {
        await auth.currentUser.getIdToken(true);
      }

      toast.success(`Đã cập nhật thông tin cho ${userToEdit.email}!`);
      onUserUpdated();
      onClose();
    } catch (error) {
      console.error("Lỗi khi cập nhật:", error);
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
        {newRole === 'admin' && (
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="canReconcile"
              checked={canReconcile}
              onChange={(e) => setCanReconcile(e.target.checked)}
              style={{ width: 'auto', cursor: 'pointer' }}
            />
            <label htmlFor="canReconcile" style={{ marginBottom: 0, cursor: 'pointer' }}>
              Cho phép đọc phiếu nhập/xuất (Đối chiếu tồn kho)
            </label>
          </div>
        )}
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
