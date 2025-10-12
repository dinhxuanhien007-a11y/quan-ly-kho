// src/components/AddAllowedUserModal.jsx
import React, { useState } from 'react';
import { functions } from '../firebaseConfig'; // <-- THAY ĐỔI: Import đối tượng functions đã cấu hình
import { httpsCallable } from "firebase/functions"; // <-- THAY ĐỔI: Chỉ giữ lại httpsCallable
import { toast } from 'react-toastify';
import { z } from 'zod';

const allowlistSchema = z.object({
  email: z.string().email({ message: "Địa chỉ email không hợp lệ." }),
});

const AddAllowedUserModal = ({ onClose, onUserAdded }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('med');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddUser = async () => {
    const validationResult = allowlistSchema.safeParse({ email });
    if (!validationResult.success) {
      toast.warn(validationResult.error.issues[0].message);
      return;
    }

    setIsSaving(true);
    try {
      // Xóa: const functions = getFunctions();
      const addUserFunc = httpsCallable(functions, 'addUserToAllowlist');
      await addUserFunc({ email: email.trim(), role: role });
      toast.success(`Đã thêm ${email} vào danh sách được phép!`);
      onUserAdded(); // Gọi lại hàm để làm mới danh sách
      onClose(); // Đóng modal
    } catch (error) {
      console.error("Lỗi khi thêm user vào allowlist:", error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{width: '500px'}}>
        <h2>Thêm Email vào Danh sách</h2>
        <div className="form-group">
            <label>Email của User (*)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
            <label>Chọn vai trò (*)</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="med">med</option>
                <option value="bio">bio</option>
                <option value="admin">admin</option>
            </select>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
          <button type="button" onClick={handleAddUser} className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Đang thêm...' : 'Thêm và Cấp quyền'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddAllowedUserModal;
