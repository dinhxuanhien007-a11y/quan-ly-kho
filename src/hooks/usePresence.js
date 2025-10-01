// src/hooks/usePresence.js

import { useEffect } from 'react';
import { useAuth } from '../context/UserContext';
import { rtdb } from '../firebaseConfig';
import { ref, onValue, set, onDisconnect, serverTimestamp } from 'firebase/database';
import { toast } from 'react-toastify'; // Thêm import toast

export const usePresence = () => {
    const { user } = useAuth();

    useEffect(() => {
        if (!user) {
            return; // Dừng nếu người dùng chưa đăng nhập
        }

        const userStatusRef = ref(rtdb, '/status/' + user.uid);
        const presenceRef = ref(rtdb, '.info/connected');

        const unsubscribe = onValue(presenceRef, (snap) => {
            if (snap.val() === false) {
                return;
            }

            // Thiết lập hành động SẼ được thực hiện khi client mất kết nối
            onDisconnect(userStatusRef).set({
                isOnline: false,
                last_changed: serverTimestamp(),
            }).catch((err) => {
                // Ghi lại lỗi nếu không thể thiết lập onDisconnect
                console.error('Lỗi khi thiết lập onDisconnect:', err);
            });

            // Đặt trạng thái online khi client kết nối thành công
            set(userStatusRef, {
                isOnline: true,
                last_changed: serverTimestamp(),
            })
            // ===== BẮT LỖI Ở ĐÂY =====
            .catch((err) => {
                // Ghi lại lỗi ra console và hiển thị cho người dùng
                console.error('Lỗi khi set trạng thái online:', err);
                toast.error(`Không thể cập nhật trạng thái online: ${err.message}`);
            });
        });

        return () => {
            unsubscribe();
        };

    }, [user]);
};