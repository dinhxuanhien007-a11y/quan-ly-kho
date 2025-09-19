// src/components/AddUserModal.jsx

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { sendPasswordResetEmail } from "firebase/auth"; // Thêm import này
import { auth } from '../firebaseConfig'; // Thêm import này
import { toast } from 'react-toastify';
import { z } from 'zod';

const inviteSchema = z.object({
  email: z.string().email({ message: "Địa chỉ email không hợp lệ." }),
});

const AddUserModal = ({ onClose, onUserAdded }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('med');
  const [isSaving, setIsSaving] = useState(false);

  const handleInvite = async () => {
    const validationResult = inviteSchema.safeParse({ email });
    if (!validationResult.success) {
      toast.warn(validationResult.error.issues[0].message);
      return;
    }

    setIsSaving(true);
    try {
      // Tác vụ 1: Gọi Cloud Function để tạo user và phân quyền
      const functions = getFunctions();
      const inviteUser = httpsCallable(functions, 'inviteUser');
      await inviteUser({ email: email.trim(), role: role });
      toast.info(`Đã tạo user ${email}. Đang gửi email mời...`);

      // Tác vụ 2: Yêu cầu Firebase gửi email thiết lập mật khẩu
      await sendPasswordResetEmail(auth, email.trim());
      
      toast.success("Đã gửi email mời thành công!");
      onUserAdded(); // Tự động đóng modal và làm mới danh sách

    } catch (error) {
      console.error("Lỗi trong quá trình mời user: ", error);
      toast.error(error.message);
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{width: '500px'}}>
        <h2>Mời User Mới</h2>
        <div className="form-group">
            <label>Email của User (*)</label>
            <input 
                type="email"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="Nhập email của người dùng mới..."
                autoFocus
            />
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
          <button type="button" onClick={handleInvite} className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Đang xử lý...' : 'Gửi Lời Mời'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddUserModal;