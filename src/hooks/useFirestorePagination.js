// src/hooks/useFirestorePagination.js
import { useState, useEffect, useCallback } from 'react';
import { getDocs, query, startAfter, limit, endBefore, limitToLast } from 'firebase/firestore';
import { toast } from 'react-toastify';

export const useFirestorePagination = (baseQuery, pageSize) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // State mới để lưu con trỏ: mỗi phần tử là [con trỏ đầu trang, con trỏ cuối trang]
    const [pageCursors, setPageCursors] = useState([]); 
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [isLastPage, setIsLastPage] = useState(false);

    const fetchPage = useCallback(async (pageIndex, direction) => {
        setLoading(true);
        try {
            let pageQuery;
            const currentCursor = pageCursors[pageIndex];

            if (direction === 'next') {
                const lastVisible = pageCursors[pageIndex - 1]?.[1]; // Lấy con trỏ cuối của trang trước
                pageQuery = query(baseQuery, startAfter(lastVisible), limit(pageSize));
            } else if (direction === 'prev') {
                const firstVisible = pageCursors[pageIndex + 1]?.[0]; // Lấy con trỏ đầu của trang sau
                pageQuery = query(baseQuery, endBefore(firstVisible), limitToLast(pageSize));
            } else { // 'first' or 'reset'
                pageQuery = query(baseQuery, limit(pageSize));
            }

            const docSnapshots = await getDocs(pageQuery);
            const list = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (!docSnapshots.empty) {
                const firstCursor = docSnapshots.docs[0];
                const lastCursor = docSnapshots.docs[docSnapshots.docs.length - 1];

                setPageCursors(prev => {
                    const newCursors = [...prev];
                    newCursors[pageIndex] = [firstCursor, lastCursor];
                    return newCursors;
                });
                
                // Kiểm tra xem có phải là trang cuối cùng không
                const checkLastPageQuery = query(baseQuery, startAfter(lastCursor), limit(1));
                const nextDoc = await getDocs(checkLastPageQuery);
                setIsLastPage(nextDoc.empty);

            } else {
                 if (direction === 'next') setIsLastPage(true);
            }
            
            setDocuments(list);

        } catch (error) {
            console.error("Lỗi khi phân trang Firestore: ", error);
            toast.error("Không thể tải dữ liệu trang. Vui lòng kiểm tra Console (F12).");
        } finally {
            setLoading(false);
        }
    }, [baseQuery, pageSize, pageCursors]);

    // Effect này sẽ chạy khi baseQuery thay đổi (ví dụ: khi tìm kiếm)
    useEffect(() => {
        setDocuments([]);
        setPageCursors([]);
        setCurrentPageIndex(0);
        setIsLastPage(false);
        fetchPage(0, 'first');
    }, [baseQuery]);

    const nextPage = () => {
        if (!isLastPage) {
            const nextPageIndex = currentPageIndex + 1;
            setCurrentPageIndex(nextPageIndex);
            fetchPage(nextPageIndex, 'next');
        }
    };

    const prevPage = () => {
         if (currentPageIndex > 0) {
            const prevPageIndex = currentPageIndex - 1;
            setCurrentPageIndex(prevPageIndex);
            fetchPage(prevPageIndex, 'prev');
        }
    };
    
    // Hàm reset để tải lại trang đầu tiên
    const reset = () => {
        setCurrentPageIndex(0);
        setPageCursors([]);
        fetchPage(0, 'reset');
    };

    return {
        documents,
        loading,
        isLastPage,
        page: currentPageIndex + 1, // Trả về số trang thân thiện với người dùng (bắt đầu từ 1)
        nextPage,
        prevPage,
        reset
    };
};