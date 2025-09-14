// src/hooks/useFirestorePagination.js
import { useState, useEffect, useCallback } from 'react';
import { getDocs, query, startAfter, limit } from 'firebase/firestore';
import { toast } from 'react-toastify';

/**
 * // <-- THÊM MỚI: Custom Hook để quản lý việc phân trang với Firestore.
 * @param {object} baseQuery - Query cơ bản của Firestore (đã bao gồm orderBy).
 * @param {number} pageSize - Số lượng mục trên mỗi trang.
 * @returns {object} - State và các hàm để điều khiển phân trang.
 */
export const useFirestorePagination = (baseQuery, pageSize) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isLastPage, setIsLastPage] = useState(false);
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    
    // Lưu con trỏ của trang trước đó để quay lại
    const [prevPageCursors, setPrevPageCursors] = useState([]);

    const fetchPage = useCallback(async (direction, cursor = null) => {
        setLoading(true);
        try {
            let pageQuery;
            if (direction === 'next' && cursor) {
                pageQuery = query(baseQuery, startAfter(cursor), limit(pageSize));
            } else { // 'first' or 'prev' (logic xử lý prev nằm ở ngoài)
                pageQuery = query(baseQuery, limit(pageSize));
            }

            const docSnapshots = await getDocs(pageQuery);
            const list = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (list.length > 0) {
                setDocuments(list);
                const newLastVisible = docSnapshots.docs[docSnapshots.docs.length - 1];
                setLastVisible(newLastVisible);
                if (direction === 'next') {
                    // Lưu con trỏ hiện tại trước khi qua trang mới
                    setPrevPageCursors(prev => [...prev, lastVisible]); 
                }
            } else {
                setDocuments([]);
            }
            
            setIsLastPage(docSnapshots.docs.length < pageSize);

        } catch (error) {
            console.error("Lỗi khi phân trang Firestore: ", error);
            toast.error("Không thể tải dữ liệu trang. Vui lòng kiểm tra Console (F12).");
        } finally {
            setLoading(false);
        }
    }, [baseQuery, pageSize, lastVisible]); // Thêm lastVisible vào dependency

    // Tự động fetch lại trang đầu khi query thay đổi (ví dụ: khi tìm kiếm)
    useEffect(() => {
        setPage(1);
        setLastVisible(null);
        setPrevPageCursors([]);
        fetchPage('first');
    }, [baseQuery]); // Chỉ chạy lại khi baseQuery thay đổi

    const nextPage = () => {
        if (!isLastPage) {
            setPage(p => p + 1);
            fetchPage('next', lastVisible);
        }
    };

    const prevPage = () => {
         if (page > 1) {
            // Logic prevPage hiện tại đơn giản là fetch lại trang đầu.
            // Để quay lại trang trước chính xác, cần một logic phức tạp hơn với `endBefore` và `limitToLast`
            // mà custom hook này chưa hỗ trợ để giữ cho nó đơn giản.
            // Ta sẽ reset về trang 1.
            setPage(1);
            setLastVisible(null);
            setPrevPageCursors([]);
            fetchPage('first');
        }
    };
    
    const reset = () => {
        setPage(1);
        setLastVisible(null);
        setPrevPageCursors([]);
        fetchPage('first');
    };

    return {
        documents,
        loading,
        isLastPage,
        page,
        nextPage,
        prevPage,
        reset // <-- Thêm hàm reset để tải lại dữ liệu khi cần
    };
};