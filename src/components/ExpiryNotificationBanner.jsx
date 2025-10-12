// src/components/ExpiryNotificationBanner.jsx

import React, { useState, useEffect } from 'react';
import { db, auth, functions } from '../firebaseConfig'; // <-- THAY ĐỔI: Import functions đã cấu hình
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions'; // <-- GIỮ LẠI
import { toast } from 'react-toastify';
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import '../styles/ExpiryNotificationBanner.css'; // Sẽ tạo file CSS ở bước sau

const ExpiryNotificationBanner = () => {
    const [notifications, setNotifications] = useState([]);
    const [isProcessing, setIsProcessing] = useState(null); // Lưu ID của notif đang xử lý

    useEffect(() => {
    // Vì component này chỉ được render khi user là 'owner',
    // chúng ta có thể tự tin rằng mình có quyền đọc dữ liệu.
    const q = query(collection(db, "notifications"), where("status", "==", "UNCONFIRMED"));
    
    const unsubscribeSnapshot = onSnapshot(q, (querySnapshot) => {
        const activeNotifs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNotifications(activeNotifs);
    }, (error) => {
        // Vẫn giữ lại để bắt các lỗi permission thật sự
        console.error("Lỗi khi lắng nghe cảnh báo:", error);
    });

    // Khi component bị gỡ bỏ (khi đăng xuất), chỉ cần ngắt kết nối snapshot.
    return () => {
        unsubscribeSnapshot();
    };
}, []); // Mảng rỗng đảm bảo effect này chỉ chạy một lần khi component được tạo.

    const handleConfirm = async (notificationId, lotId) => {
        setIsProcessing(notificationId);
        const confirmAction = httpsCallable(functions, 'confirmExpiryNotification');
        
        try {
            const result = await confirmAction({ notificationId, lotId });
            toast.success(result.data.message || "Đã xác nhận xử lý lô hàng!");
            // Giao diện sẽ tự động cập nhật nhờ onSnapshot, không cần làm gì thêm
        } catch (error) {
            console.error("Lỗi khi xác nhận: ", error);
            toast.error(error.message);
        } finally {
            setIsProcessing(null); // Hoàn tất xử lý
        }
    };

    if (notifications.length === 0) {
        return null;
    }

    return (
        <div className="expiry-notification-banner">
            <div className="banner-header">
                <FiAlertTriangle />
                <h4>CẢNH BÁO: CÓ {notifications.length} LÔ HÀNG ĐÃ HẾT HẠN SỬ DỤNG!</h4>
            </div>
            <p>Vui lòng di dời các lô hàng này vào khu vực hàng hết date và xác nhận bên dưới.</p>
            <ul className="notification-list">
                {notifications.map(notif => (
                    <li key={notif.id} className={isProcessing === notif.id ? 'processing' : ''}>
                        <span className="message">{notif.message}</span>
                        <button 
                            onClick={() => handleConfirm(notif.id, notif.lotId)}
                            disabled={isProcessing === notif.id}
                            className="confirm-button"
                        >
                            {isProcessing === notif.id ? 'Đang xử lý...' : <><FiCheckCircle /> Xác nhận</>}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ExpiryNotificationBanner;
