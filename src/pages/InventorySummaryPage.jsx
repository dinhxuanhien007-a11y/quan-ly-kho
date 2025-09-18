// src/pages/InventorySummaryPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, getDocs, where, orderBy, documentId, limit, startAfter, Timestamp } from 'firebase/firestore';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { FiChevronDown, FiChevronRight, FiChevronLeft, FiPrinter } from 'react-icons/fi';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { toast } from 'react-toastify';

// <-- THAY ĐỔI 1: Import thêm hàm getRowColorByExpiry
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';

const PAGE_SIZE = 15;

// <-- THAY ĐỔI 2: Xóa toàn bộ hàm getRowColorByExpiry ở đây

const getLotItemColorClass = (expiryDate) => {
    if (!expiryDate || !expiryDate.toDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = expiryDate.toDate();
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'lot-item-expired';
    if (diffDays <= 60) return 'lot-item-red';
    if (diffDays <= 90) return 'lot-item-orange';
    if (diffDays <= 120) return 'lot-item-yellow';
    return '';
};

const InventorySummaryPage = () => {
    const { userRole } = useAuth();
    const [summaries, setSummaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRows, setExpandedRows] = useState({});
    const [lotDetails, setLotDetails] = useState({});
    const [loadingLots, setLoadingLots] = useState({});
    
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    const [isLastPage, setIsLastPage] = useState(false);
    const [activeFilter, setActiveFilter] = useState({ type: 'none', value: '' });

    const fetchData = useCallback(async (direction = 'next', cursor = null) => {
        setLoading(true);
        try {
            // Bước 1: Xây dựng câu truy vấn gốc (baseQuery) một cách linh hoạt
            let baseQuery;

            if (activeFilter.type === 'near_expiry') {
                const today = Timestamp.now();
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 120);
                const futureTimestamp = Timestamp.fromDate(futureDate);
                baseQuery = query(
                    collection(db, "product_summaries"),
                    where("nearestExpiryDate", ">=", today),
                    where("nearestExpiryDate", "<=", futureTimestamp),
                    orderBy("nearestExpiryDate", "asc")
                );
            } else if (activeFilter.type === 'expired') {
                const today = Timestamp.now();
                baseQuery = query(
                    collection(db, "product_summaries"),
                    where("nearestExpiryDate", "<", today),
                    orderBy("nearestExpiryDate", "asc")
                );
            } else {
                baseQuery = query(collection(db, "product_summaries"), orderBy(documentId(), "asc"));
                if (activeFilter.type === 'team') {
                    baseQuery = query(baseQuery, where("team", "==", activeFilter.value));
                }
            }
            
            // Bước 2: Áp dụng logic phân trang vào câu truy vấn gốc
            let paginatedQuery = baseQuery;

            if (direction === 'next' && cursor) {
                paginatedQuery = query(paginatedQuery, startAfter(cursor), limit(PAGE_SIZE));
            } else {
                paginatedQuery = query(paginatedQuery, limit(PAGE_SIZE));
                if (direction === 'first') setPage(1);
            }

            // Bước 3: Thực thi câu truy vấn cuối cùng
            const docSnapshots = await getDocs(paginatedQuery);
            const summaryList = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1] || null);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setSummaries(summaryList);
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu tổng hợp: ", error);
            toast.error("Đã xảy ra lỗi khi tải dữ liệu.");
        } finally {
            setLoading(false);
        }
    }, [activeFilter]);

    const performSearch = useCallback(async (term) => {
        if (!term) return;
        setLoading(true);
        try {
            const upperTerm = term.toUpperCase();
            const productSearchQuery = query(
                collection(db, "product_summaries"),
                where(documentId(), ">=", upperTerm),
                where(documentId(), "<=", upperTerm + '\uf8ff')
            );
            const lotSearchQuery = query(
                collection(db, "inventory_lots"),
                where("lotNumber", "==", term)
            );
  
            const [productSnap, lotSnap] = await Promise.all([
                getDocs(productSearchQuery),
                getDocs(lotSearchQuery)
            ]);
            const foundProductIds = new Set(productSnap.docs.map(doc => doc.id));
            lotSnap.docs.forEach(doc => foundProductIds.add(doc.data().productId));
         
            if (foundProductIds.size === 0) {
                setSummaries([]);
                setIsLastPage(true);
            } else {
                const finalQuery = query(
                    collection(db, "product_summaries"),
                    where(documentId(), 'in', Array.from(foundProductIds).slice(0, 30))
                );
                const finalSnap = await getDocs(finalQuery);
                setSummaries(finalSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setIsLastPage(true);
            }
        } catch (error) {
            console.error("Lỗi khi tìm kiếm:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const debounce = setTimeout(() => {
            setLastVisible(null);
            setPage(1);
            if (searchTerm) {
                performSearch(searchTerm);
            } else {
                fetchData('first');
            }
        }, 500);
        return () => clearTimeout(debounce);
    }, [searchTerm, activeFilter, fetchData, performSearch]);

    const toggleRow = async (productId) => {
        const isCurrentlyExpanded = !!expandedRows[productId];
        if (!lotDetails[productId]) {
            setLoadingLots(prev => ({ ...prev, [productId]: true }));
            try {
                const lotsQuery = query(
                    collection(db, "inventory_lots"),
                    where("productId", "==", productId),
                    where("quantityRemaining", ">", 0),
                    orderBy("expiryDate", "asc")
                );
                const lotsSnapshot = await getDocs(lotsQuery);
                const lots = lotsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                setLotDetails(prev => ({ ...prev, [productId]: lots }));
            } catch (error) {
                console.error("Lỗi khi tải chi tiết lô:", error);
                setLotDetails(prev => ({ ...prev, [productId]: [] }));
            } finally {
                setLoadingLots(prev => ({ ...prev, [productId]: false }));
            }
        }
        setExpandedRows(prev => ({ ...prev, [productId]: !isCurrentlyExpanded }));
    };

    const handleNextPage = () => {
        if (!isLastPage) {
            setPage(p => p + 1);
            fetchData('next', lastVisible);
        }
    };

    const handlePrevPage = () => {
        setLastVisible(null);
        fetchData('first');
    };

    const handleFilterChange = (type, value = '') => {
        if (activeFilter.type === type && activeFilter.value === value) {
            setActiveFilter({ type: 'none', value: '' });
        } else {
            setActiveFilter({ type, value });
        }
    };
    
    const handlePrint = async () => {
        const originalTitle = document.title;
        document.title = `BaoCao_TonKho_TongHop_${new Date().toLocaleDateString('vi-VN')}`;

        const allProductIds = summaries.map(s => s.id);
        const fetchPromises = allProductIds.map(id => {
            if (!lotDetails[id]) return toggleRow(id);
            return Promise.resolve();
        });
        toast.info("Đang chuẩn bị dữ liệu để in, vui lòng chờ...");
        await Promise.all(fetchPromises);
        const allExpanded = allProductIds.reduce((acc, id) => {
            acc[id] = true;
            return acc;
        }, {});
        setExpandedRows(allExpanded);
        
        setTimeout(() => {
            window.print();
            document.title = originalTitle;
            setExpandedRows({});
        }, 500);
    };
    
    return (
        <div className="printable-inventory-area inventory-summary-page">
            <div className="page-header">
                <h1>Tồn Kho Tổng Hợp</h1>
                {(userRole === 'owner' || userRole === 'admin') && (
                    <button onClick={handlePrint} className="btn-secondary" style={{width: 'auto'}}>
                        <FiPrinter style={{marginRight: '5px'}} />
                        In Báo Cáo
                    </button>
                )}
            </div>
       
            <div className="controls-container" style={{justifyContent: 'flex-start', flexWrap: 'wrap'}}>
                 <div className="filter-group">
                    <button className={activeFilter.value === 'MED' ? 'active' : ''} onClick={() => handleFilterChange('team', 'MED')}>Lọc hàng MED</button>
                    <button className={activeFilter.value === 'BIO' ? 'active' : ''} onClick={() => handleFilterChange('team', 'BIO')}>Lọc hàng BIO</button>
                    <button className={activeFilter.value === 'Spare Part' ? 'active' : ''} onClick={() => handleFilterChange('team', 'Spare Part')}>Lọc hàng Spare Part</button>
                </div>
                <div className="filter-group">
                    <button className={activeFilter.type === 'near_expiry' ? 'active' : ''} onClick={() => handleFilterChange('near_expiry')}>Lọc hàng cận date</button>
                    <button className={activeFilter.type === 'expired' ? 'active' : ''} onClick={() => handleFilterChange('expired')}>Lọc hàng hết date</button>
                </div>
                <div className="search-container" style={{ flexGrow: 1, maxWidth: '400px' }}>
                    <input
                        type="text"
                        placeholder="Tìm theo Mã hàng hoặc Số lô..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            {loading ? <Spinner /> : (
                <>
                    <div className="table-container">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th style={{width: '50px'}}></th>
                                    <th>Mã hàng</th>
                                    <th>Tên hàng</th>
                                    <th>HSD Gần Nhất</th>
                                    <th>Tổng Tồn</th>
                                    <th>ĐVT</th>
                                    <th>Nhiệt độ BQ</th>
                                    <th>Team</th>
                                </tr>
                            </thead>
                 
                            <tbody>
                                {summaries.map(product => (
                                    <React.Fragment key={product.id}>
                                        <tr 
                                            onClick={() => toggleRow(product.id)} 
                                            style={{cursor: 'pointer'}}
                                            className={getRowColorByExpiry(product.nearestExpiryDate)}
                                        >
                                            <td>{expandedRows[product.id] ? <FiChevronDown /> : <FiChevronRight />}</td>
                                            <td data-label="Mã hàng"><strong>{product.id}</strong></td>
                                            <td data-label="Tên hàng">{product.productName}</td>
                                            <td data-label="HSD Gần Nhất">{formatDate(product.nearestExpiryDate)}</td>
                                            <td data-label="Tổng Tồn"><strong>{product.totalRemaining}</strong></td>
                                            <td data-label="ĐVT">{product.unit}</td>
                                            <td data-label="Nhiệt độ BQ"><TempBadge temperature={product.storageTemp} /></td>
                                            <td data-label="Team"><TeamBadge team={product.team} /></td>
                                        </tr>
                             
                                        {expandedRows[product.id] && (
                                            <tr className="lot-details-row">
                                                <td colSpan="8">
                                                    <div className="lot-details-container">
                                                        {loadingLots[product.id] ? (
                                                            <SkeletonTheme baseColor="#e9ecef" highlightColor="#f8f9fa">
                                                                <h4><Skeleton width={200} /></h4>
                                                                <ul>
                                                                    <li><Skeleton height={35} count={3} style={{ marginBottom: '8px' }}/></li>
                                                                </ul>
                                                            </SkeletonTheme>
                                                        ) : (
                                                            (lotDetails[product.id] && lotDetails[product.id].length > 0) ? (
                                                                <>
                                                                    <h4>Chi tiết các lô hàng (FEFO):</h4>
                                                                    <ul>
                                                                        {lotDetails[product.id].map(lot => (
                                                                            <li key={lot.id} className={`lot-item ${getLotItemColorClass(lot.expiryDate)}`}>
                                                                                <span>Lô: <strong>{lot.lotNumber}</strong></span>
                                                                                <span>HSD: <strong>{formatDate(lot.expiryDate)}</strong></span>
                                                                                <span>Tồn: <strong>{lot.quantityRemaining}</strong></span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </>
                                                            ) : <p>Không có lô nào còn tồn kho cho sản phẩm này.</p>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!searchTerm && (
                        <div className="pagination-controls">
                            <button onClick={handlePrevPage} disabled={page <= 1}>
                                <FiChevronLeft /> Trang Trước
                            </button>
                            <span>Trang {page}</span>
                            <button onClick={handleNextPage} disabled={isLastPage}>
                                Trang Tiếp <FiChevronRight />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default InventorySummaryPage;