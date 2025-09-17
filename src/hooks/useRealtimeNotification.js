// src/hooks/useRealtimeNotification.js
import { useState, useEffect } from 'react';
import { onSnapshot, query, orderBy, limit } from 'firebase/firestore';

/**
 * Một custom hook để lắng nghe bản ghi mới nhất trong một collection trên Firestore.
 * @param {object} baseQuery - Query gốc của collection cần lắng nghe.
 * @param {Array} documents - Mảng documents hiện tại từ useFirestorePagination.
 * @param {number} page - Số trang hiện tại.
 * @param {string} searchTerm - Chuỗi tìm kiếm hiện tại (nếu có).
 * @returns {{hasNewData: boolean, setHasNewData: function}} - Trạng thái báo có dữ liệu mới và hàm để cập nhật nó.
 */
export const useRealtimeNotification = (baseQuery, documents, page, searchTerm = '') => {
    const [hasNewData, setHasNewData] = useState(false);

    useEffect(() => {
        // Chỉ lắng nghe ở trang đầu tiên và khi không có tìm kiếm
        if (page !== 1 || searchTerm) {
            // Nếu không thỏa điều kiện, đảm bảo thông báo không hiển thị
            if (hasNewData) setHasNewData(false);
            return;
        }

        // Tạo một query mới chỉ để lắng nghe document mới nhất dựa trên createdAt
        const newestDocQuery = query(
            baseQuery,
            orderBy("createdAt", "desc"),
            limit(1)
        );

        const unsubscribe = onSnapshot(newestDocQuery, (snapshot) => {
            if (snapshot.empty || documents.length === 0) {
                return;
            }

            const newestDocId = snapshot.docs[0]?.id;
            const currentFirstDocId = documents[0]?.id;

            // Nếu ID của document mới nhất khác với ID của document đầu tiên đang hiển thị
            // -> Có dữ liệu mới
            if (newestDocId && currentFirstDocId && newestDocId !== currentFirstDocId) {
                setHasNewData(true);
            }
        }, (error) => {
            console.error("Lỗi khi lắng nghe dữ liệu real-time:", error);
        });

        // Dọn dẹp listener khi component unmount hoặc dependency thay đổi
        return () => unsubscribe();

    }, [documents, page, baseQuery, searchTerm, hasNewData]); // Thêm hasNewData để có thể reset từ bên ngoài

    return { hasNewData, setHasNewData };
};