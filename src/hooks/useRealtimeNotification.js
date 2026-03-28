import { useState, useEffect, useRef } from 'react';
import { onSnapshot, query, limit, getDocs } from 'firebase/firestore';

export const useRealtimeNotification = (baseQuery) => {
    const [hasNewData, setHasNewData] = useState(false);
    const lastSeenTimestampRef = useRef(null);
    const isInitializedRef = useRef(false); // true sau khi getDocs đầu tiên hoàn thành

    useEffect(() => {
        if (!baseQuery) return;
        
        isInitializedRef.current = false;
        const newestDocQuery = query(baseQuery, limit(1));

        // Lấy timestamp ban đầu trước, rồi mới đăng ký listener
        getDocs(newestDocQuery).then(snapshot => {
            if (!snapshot.empty) {
                lastSeenTimestampRef.current = snapshot.docs[0].data().createdAt;
            }
            isInitializedRef.current = true;
        });

        const unsubscribe = onSnapshot(newestDocQuery, (snapshot) => {
            // Chưa khởi tạo xong hoặc không có data thì bỏ qua
            if (!isInitializedRef.current || snapshot.empty) return;

            const newestDoc = snapshot.docs[0].data();
            const newestTimestamp = newestDoc.createdAt;

            if (
                lastSeenTimestampRef.current &&
                newestTimestamp &&
                typeof newestTimestamp.toMillis === 'function' &&
                newestTimestamp.toMillis() > lastSeenTimestampRef.current.toMillis() &&
                !snapshot.metadata.hasPendingWrites
            ) {
                setHasNewData(true);
            }
        }, (error) => {
            console.error("Lỗi khi lắng nghe dữ liệu real-time:", error);
        });

        return () => {
            unsubscribe();
        };

    }, [baseQuery]);

    const dismissNewData = () => {
        setHasNewData(false);
        // Cập nhật timestamp mới nhất khi user dismiss
        if (baseQuery) {
            getDocs(query(baseQuery, limit(1))).then(snapshot => {
                if (!snapshot.empty) {
                    lastSeenTimestampRef.current = snapshot.docs[0].data().createdAt;
                }
            });
        }
    };

    return { hasNewData, dismissNewData };
};