// src/components/AddUserModal.jsx

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { toast } from 'react-toastify';
import { z } from 'zod';

const inviteSchema = z.object({
  email: z.string().email({ message: "Địa chỉ email không hợp lệ." }),
});

const AddUserModal = ({ onClose, onUserAdded }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('med');
  const [isSaving, setIsSaving] = useState(false);

  // MỚI: State để lưu trữ link sau khi tạo thành công
  const [generatedLink, setGeneratedLink] = useState(null);

  const handleInvite = async () => {
    const validationResult = inviteSchema.safeParse({ email });
    if (!validationResult.success) {
      toast.warn(validationResult.error.issues[0].message);
      return;
    }

    setIsSaving(true);
    try {
      const functions = getFunctions();
      const inviteUser = httpsCallable(functions, 'inviteUser');
      
      const result = await inviteUser({ 
        email: email.trim(), 
        role: role 
      });

      if (result.data.success) {
        toast.success("Tạo user và link mời thành công!");
        setGeneratedLink(result.data.link); // Lưu link để hiển thị
      }
    } catch (error) {
      console.error("Lỗi khi gọi Cloud Function: ", error);
      toast.error(error.message);
      setIsSaving(false);
    }
    // Không tắt isSaving ở đây để giữ modal hiển thị link
  };

  // MỚI: Hàm để đóng modal và refresh danh sách
  const handleCloseAndRefresh = () => {
      onUserAdded();
      onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{width: '500px'}}>

        {/* --- Giao diện hiển thị link sau khi thành công --- */}
        {generatedLink ? (
          <div>
            <h2>Gửi lời mời thành công!</h2>
            <p>Vui lòng sao chép và gửi đường link dưới đây cho người dùng <strong>{email}</strong>. Link này sẽ giúp họ tự đặt mật khẩu đầu tiên.</p>
            <div className="form-group">
                <textarea
                    readOnly
                    value={generatedLink}
                    rows={4}
                    style={{backgroundColor: '#f8f9fa', cursor: 'pointer'}}
                    onClick={(e) => e.target.select()}
                />
            </div>
            <div className="modal-actions">
                <button type="button" onClick={handleCloseAndRefresh} className="btn-primary">Hoàn tất</button>
            </div>
          </div>
        ) : (
        
        // --- Giao diện mời user ban đầu ---
          <div>
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
                {isSaving ? 'Đang xử lý...' : 'Tạo và Lấy Link Mời'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddUserModal;
