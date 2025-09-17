// src/hooks/useFirestorePagination.js
import { useState, useEffect, useCallback } from 'react';
import { getDocs, query, startAfter, limit, endBefore, limitToLast } from 'firebase/firestore';
import { toast } from 'react-toastify';

export const useFirestorePagination = (baseQuery, pageSize) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [pageCursors, setPageCursors] = useState([]); 
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [isLastPage, setIsLastPage] = useState(false);

    const fetchPage = useCallback(async (pageIndex, direction) => {
        setLoading(true);
        try {
            let pageQuery;
            if (direction === 'next') {
                const lastVisible = pageCursors[pageIndex - 1]?.[1];
                if (!lastVisible) {
                    setIsLastPage(true);
                    setLoading(false);
                    return;
                }
                pageQuery = query(baseQuery, startAfter(lastVisible), limit(pageSize));
            } else if (direction === 'prev') {
                const firstVisible = pageCursors[pageIndex + 1]?.[0];
                pageQuery = query(baseQuery, endBefore(firstVisible), limitToLast(pageSize));
            } else { // 'first' or 'reset'
                pageQuery = query(baseQuery, limit(pageSize));
            }

            const docSnapshots = await getDocs(pageQuery);
            const list = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (docSnapshots.empty) {
                if (direction === 'first' || direction === 'reset') {
                    setDocuments([]);
                    setIsLastPage(true);
                } else if (direction === 'next') {
                    setIsLastPage(true);
                }
            } else {
                const firstCursor = docSnapshots.docs[0];
                const lastCursor = docSnapshots.docs[docSnapshots.docs.length - 1];
                
                setPageCursors(prev => {
                    const newCursors = [...prev];
                    newCursors[pageIndex] = [firstCursor, lastCursor];
                    return newCursors;
                });

                const checkLastPageQuery = query(baseQuery, startAfter(lastCursor), limit(1));
                const nextDoc = await getDocs(checkLastPageQuery);
                setIsLastPage(nextDoc.empty);
                setDocuments(list);
            }
        } catch (error) {
            console.error("Lỗi khi phân trang Firestore: ", error);
            toast.error("Không thể tải dữ liệu trang. Vui lòng kiểm tra Console (F12).");
        } finally {
            setLoading(false);
        }
    }, [baseQuery, pageSize, pageCursors]);

    // Effect này sẽ chạy khi baseQuery thay đổi (ví dụ: khi tìm kiếm)
    // <-- THAY ĐỔI DUY NHẤT Ở ĐÂY -->
    useEffect(() => {
        setDocuments([]);
        setPageCursors([]);
        setCurrentPageIndex(0);
        setIsLastPage(false);
        fetchPage(0, 'first');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseQuery]); // <-- XÓA fetchPage khỏi mảng dependency để phá vỡ vòng lặp

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
    
    const reset = () => {
        setCurrentPageIndex(0);
        setPageCursors([]);
        fetchPage(0, 'reset');
    };

    return {
        documents,
        loading,
        isLastPage,
        page: currentPageIndex + 1,
        nextPage,
        prevPage,
        reset
    };
};