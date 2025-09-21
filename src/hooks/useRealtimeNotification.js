import { useState, useEffect, useRef } from 'react';
import { onSnapshot, query, limit, getDocs } from 'firebase/firestore';

export const useRealtimeNotification = (baseQuery) => {
    const [hasNewData, setHasNewData] = useState(false);
    // Dùng Ref để lưu timestamp, sẽ không bị reset khi re-render
    const lastSeenTimestampRef = useRef(null);
    const isInitialLoadRef = useRef(true); // Cờ để đánh dấu lần tải đầu tiên

    useEffect(() => {
        if (!baseQuery) return;
        
        // Luôn chỉ lấy 1 document mới nhất dựa trên baseQuery
        const newestDocQuery = query(baseQuery, limit(1));

        // Thiết lập timestamp ban đầu
        if (isInitialLoadRef.current) {
            getDocs(newestDocQuery).then(snapshot => {
                if (!snapshot.empty) {
                    lastSeenTimestampRef.current = snapshot.docs[0].data().createdAt;
                }
                isInitialLoadRef.current = false; // Đánh dấu đã qua lần tải đầu
            });
        }

        const unsubscribe = onSnapshot(newestDocQuery, (snapshot) => {
            // Không chạy logic nếu đang ở lần tải đầu tiên
            if (isInitialLoadRef.current || snapshot.empty) {
                return;
            }

            const newestDoc = snapshot.docs[0].data();
            const newestTimestamp = newestDoc.createdAt;

            // Chỉ hiển thị thông báo nếu có document mới thật sự
            if (lastSeenTimestampRef.current && newestTimestamp.toMillis() > lastSeenTimestampRef.current.toMillis()) {
                setHasNewData(true);
            }
        }, (error) => {
            console.error("Lỗi khi lắng nghe dữ liệu real-time:", error);
        });

        return () => {
            unsubscribe();
            isInitialLoadRef.current = true; // Reset lại khi query thay đổi
        };

    }, [baseQuery]);

    // Hàm để người dùng bấm vào nút "Tải lại"
    const dismissNewData = () => {
        setHasNewData(false);
        isInitialLoadRef.current = true; // Reset lại để nó lấy timestamp mới nhất
    };

    return { hasNewData, dismissNewData }; // Trả về dismissNewData
};