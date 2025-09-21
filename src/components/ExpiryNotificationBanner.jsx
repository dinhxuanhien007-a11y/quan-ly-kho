// src/components/ExpiryNotificationBanner.jsx

import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig'; // Đảm bảo bạn đã export auth
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'react-toastify';
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import '../styles/ExpiryNotificationBanner.css'; // Sẽ tạo file CSS ở bước sau

const ExpiryNotificationBanner = () => {
    const [notifications, setNotifications] = useState([]);
    const [isProcessing, setIsProcessing] = useState(null); // Lưu ID của notif đang xử lý

    useEffect(() => {
        // Chỉ lắng nghe khi user đã đăng nhập
        const unsubscribeAuth = auth.onAuthStateChanged(user => {
            if (user) {
                const q = query(collection(db, "notifications"), where("status", "==", "UNCONFIRMED"));
                
                const unsubscribeSnapshot = onSnapshot(q, (querySnapshot) => {
                    const activeNotifs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setNotifications(activeNotifs);
                }, (error) => {
                    console.error("Lỗi khi lắng nghe cảnh báo: ", error);
                    toast.error("Không thể tải danh sách cảnh báo.");
                });

                // Trả về hàm dọn dẹp cho snapshot listener
                return () => unsubscribeSnapshot();
            } else {
                setNotifications([]); // Xóa cảnh báo nếu user đăng xuất
            }
        });

        // Trả về hàm dọn dẹp cho auth listener
        return () => unsubscribeAuth();
    }, []);

    const handleConfirm = async (notificationId, lotId) => {
        setIsProcessing(notificationId);
        const functions = getFunctions();
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