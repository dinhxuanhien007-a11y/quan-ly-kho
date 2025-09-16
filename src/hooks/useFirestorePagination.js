// src/hooks/useFirestorePagination.js
import { useState, useEffect, useCallback } from 'react';
import { getDocs, query, startAfter, limit, endBefore, limitToLast } from 'firebase/firestore'; // Thêm endBefore và limitToLast
import { toast } from 'react-toastify';

export const useFirestorePagination = (baseQuery, pageSize) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isLastPage, setIsLastPage] = useState(false);
    
    // Sửa đổi: pageStartCursors sẽ lưu con trỏ ĐẦU TIÊN của mỗi trang
    const [pageStartCursors, setPageStartCursors] = useState([null]); // Trang 1 luôn bắt đầu từ null
    const [currentPage, setCurrentPage] = useState(1);

    const fetchPage = useCallback(async (pageNumber, direction) => {
        setLoading(true);
        try {
            let pageQuery;
            const cursor = pageStartCursors[pageNumber - 1];

            if (direction === 'next') {
                pageQuery = query(baseQuery, startAfter(cursor), limit(pageSize));
            } else if (direction === 'prev') {
                 // Với prev, chúng ta cần query ngược lại, nhưng để đơn giản và hiệu quả hơn,
                 // ta sẽ query xuôi từ con trỏ đã lưu.
                pageQuery = query(baseQuery, startAfter(cursor), limit(pageSize));
                // Nếu cursor là null (tức là quay về trang 1), không cần startAfter
                if (!cursor) {
                    pageQuery = query(baseQuery, limit(pageSize));
                }
            }
             else { // 'first'
                pageQuery = query(baseQuery, limit(pageSize));
            }

            const docSnapshots = await getDocs(pageQuery);
            const list = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            setDocuments(list);

            if (direction === 'next' && list.length > 0) {
                const lastVisible = docSnapshots.docs[docSnapshots.docs.length - 1];
                // Lưu con trỏ cuối cùng của trang hiện tại để làm điểm bắt đầu cho trang tiếp theo
                setPageStartCursors(prev => {
                    const newCursors = [...prev];
                    newCursors[pageNumber] = lastVisible; // Con trỏ bắt đầu của trang KẾ TIẾP
                    return newCursors;
                });
            }

            setIsLastPage(docSnapshots.docs.length < pageSize);
        } catch (error) {
            console.error("Lỗi khi phân trang Firestore: ", error);
            toast.error("Không thể tải dữ liệu trang. Vui lòng kiểm tra Console (F12).");
        } finally {
            setLoading(false);
        }
    }, [baseQuery, pageSize, pageStartCursors]);

    useEffect(() => {
        setCurrentPage(1);
        setPageStartCursors([null]);
        fetchPage(1, 'first');
    }, [baseQuery]); // Chỉ chạy lại khi query cơ sở thay đổi

    const nextPage = () => {
        if (!isLastPage) {
            const nextPageNumber = currentPage + 1;
            setCurrentPage(nextPageNumber);
            fetchPage(nextPageNumber, 'next');
        }
    };

    const prevPage = () => {
         if (currentPage > 1) {
            const prevPageNumber = currentPage - 1;
            setCurrentPage(prevPageNumber);
            // Chúng ta không cần xóa con trỏ của trang hiện tại, chỉ cần tải lại trang trước đó
            fetchPage(prevPageNumber, 'prev');
        }
    };
    
    const reset = () => {
        setCurrentPage(1);
        setPageStartCursors([null]);
        fetchPage(1, 'first');
    };

    return {
        documents,
        loading,
        isLastPage,
        page: currentPage, // Trả về trang hiện tại
        nextPage,
        prevPage,
        reset
    };
};