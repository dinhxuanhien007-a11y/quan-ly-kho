import { useState, useEffect, useCallback } from 'react';
import { getDocs, query, startAfter, limit } from 'firebase/firestore';
import { toast } from 'react-toastify';

export const useFirestorePagination = (baseQuery, pageSize) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [cursorHistory, setCursorHistory] = useState([null]);
    const [isLastPage, setIsLastPage] = useState(false);

    const fetchData = useCallback(async (targetPage, currentCursorHistory = [null]) => {
        setLoading(true);
        try {
            const cursor = currentCursorHistory[targetPage - 1];
            let pageQuery;

            if (targetPage === 1) {
                pageQuery = query(baseQuery, limit(pageSize));
            } else {
                pageQuery = query(baseQuery, startAfter(cursor), limit(pageSize));
            }

            const docSnapshots = await getDocs(pageQuery);
            const list = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setIsLastPage(list.length < pageSize);
            setDocuments(list);

            const lastVisible = docSnapshots.docs[docSnapshots.docs.length - 1];
            if (lastVisible) {
                setCursorHistory(prev => {
                    const newHistory = [...prev];
                    newHistory[targetPage] = lastVisible;
                    return newHistory;
                });
            }
        } catch (error) {
            console.error("Lỗi khi phân trang Firestore: ", error);
            toast.error("Không thể tải dữ liệu trang.");
            setDocuments([]);
        } finally {
            setLoading(false);
        }
    }, [baseQuery, pageSize]);

    // HÀM MỚI: Reset lại trạng thái và tải lại trang đầu
    const reset = useCallback(() => {
        setPage(1);
        setCursorHistory([null]);
        setIsLastPage(false);
        fetchData(1, [null]);
    }, [fetchData]);

    useEffect(() => {
        reset();
    }, [baseQuery, reset]);

    const nextPage = () => {
        if (!isLastPage) {
            const newPage = page + 1;
            setPage(newPage);
            fetchData(newPage, cursorHistory);
        }
    };

    const prevPage = () => {
        if (page > 1) {
            const newPage = page - 1;
            setPage(newPage);
            fetchData(newPage, cursorHistory);
        }
    };

    return { documents, loading, isLastPage, page, nextPage, prevPage, reset };
};