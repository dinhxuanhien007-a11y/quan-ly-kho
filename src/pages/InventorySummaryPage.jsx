// src/pages/InventorySummaryPage.jsx

import { formatNumber } from '../utils/numberUtils';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db } from '../firebaseConfig';
import {
    collection,
    query,
    getDocs,
    where,
    orderBy,
    documentId,
    limit,
    startAfter,
    Timestamp,
    doc,
    getDoc,
    onSnapshot
} from 'firebase/firestore';
import NewDataNotification from '../components/NewDataNotification';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { FiChevronDown, FiChevronRight, FiChevronLeft } from 'react-icons/fi';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { toast } from 'react-toastify';
import '../styles/Responsive.css';
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';
import HighlightText from '../components/HighlightText';
import companyLogo from '../assets/logo.png';
import { ALL_SUBGROUPS, SUBGROUPS_BY_TEAM, SPECIAL_EXPIRY_SUBGROUPS } from '../constants';

const PAGE_SIZE = 15;

// src/pages/InventorySummaryPage.jsx

// Hàm tô màu cho các lô hàng chi tiết (khi xổ xuống)
const getLotItemColorClass = (expiryDate, subGroup) => {
    if (!expiryDate || !expiryDate.toDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = expiryDate.toDate();
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // --- LOGIC MỚI ---
    // Quy tắc 1: Cho nhóm BD BDB và BD DS
    if (SPECIAL_EXPIRY_SUBGROUPS.includes(subGroup)) {
        if (diffDays < 0) return 'lot-item-expired';
        if (diffDays <= 30) return 'lot-item-red';
        if (diffDays <= 60) return 'lot-item-orange';
        if (diffDays <= 90) return 'lot-item-yellow';
    } 
    // Quy tắc 2: Cho tất cả các nhóm hàng còn lại
    else {
        if (diffDays < 0) return 'lot-item-expired';
        if (diffDays <= 70) return 'lot-item-red';
        if (diffDays <= 140) return 'lot-item-orange';
        if (diffDays <= 210) return 'lot-item-yellow';
    }
    return '';
};


const InventorySummaryPage = ({ pageTitle }) => {
    const { role: userRole } = useAuth();
    const [summaries, setSummaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRows, setExpandedRows] = useState({});
    const [lotDetails, setLotDetails] = useState({});
    const [loadingLots, setLoadingLots] = useState({});
    
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    const [isLastPage, setIsLastPage] = useState(false);
    
    const [filters, setFilters] = useState({ 
        dateStatus: 'all', 
        team: 'all', 
        subGroup: 'all' 
    });
    
    const [hasNewData, setHasNewData] = useState(false);
    const lastSeenTimestampRef = useRef(null);

    const [isSubGroupOpen, setIsSubGroupOpen] = useState(false);
    const subGroupRef = useRef(null);

    const fetchData = useCallback(async (direction = 'next', cursor = null) => {
        setLoading(true);
        try {
            const baseCollectionRef = collection(db, "product_summaries");
            let queryConstraints = [];

            // Áp dụng bộ lọc vai trò trước
            if (userRole === 'med') {
                queryConstraints.push(where("team", "==", "MED"));
            } else if (userRole === 'bio') {
                queryConstraints.push(where("team", "==", "BIO"));
            }

            // Áp dụng bộ lọc do người dùng chọn
            if (filters.team !== 'all') {
                queryConstraints.push(where("team", "==", filters.team));
            }
            if (filters.subGroup !== 'all') {
                queryConstraints.push(where("subGroup", "==", filters.subGroup));
            }

            // Áp dụng bộ lọc HSD và sắp xếp
            if (filters.dateStatus === 'expired') {
                queryConstraints.push(where("nearestExpiryDate", "<", Timestamp.now()));
                queryConstraints.push(orderBy("nearestExpiryDate", "desc"));
                queryConstraints.push(orderBy(documentId(), "asc"));
            } else if (filters.dateStatus === 'near_expiry') {
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 210); // Ngưỡng cao nhất
                queryConstraints.push(where("nearestExpiryDate", ">=", Timestamp.now()));
                queryConstraints.push(where("nearestExpiryDate", "<=", Timestamp.fromDate(futureDate)));
                queryConstraints.push(orderBy("nearestExpiryDate", "asc"));
                queryConstraints.push(orderBy(documentId(), "asc"));
            } else {
                queryConstraints.push(orderBy(documentId(), "asc"));
            }

            // Phân trang
            if (direction === 'next' && cursor) {
                queryConstraints.push(startAfter(cursor));
            } else if (direction === 'first') {
                setPage(1);
            }
            queryConstraints.push(limit(PAGE_SIZE));
            
            const mainQuery = query(baseCollectionRef, ...queryConstraints);
            const mainSnapshot = await getDocs(mainQuery);

            if (mainSnapshot.empty) {
                setSummaries([]);
                setIsLastPage(true);
                setLastVisible(null);
                return;
            }
            
            const summaryDocs = mainSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSummaries(summaryDocs);

            setLastVisible(mainSnapshot.docs[mainSnapshot.docs.length - 1] || null);
            setIsLastPage(mainSnapshot.docs.length < PAGE_SIZE);

        } catch (error) {
            console.error("Lỗi khi tải dữ liệu tổng hợp: ", error);
            if (error.message.includes('requires an index')) {
                toast.error("Lỗi truy vấn, bạn cần tạo Index trong Firestore. Hãy kiểm tra Console (F12) để xem link tạo tự động.");
            } else {
                toast.error("Không thể tải dữ liệu.");
            }
        } finally {
            setLoading(false);
        }
    }, [filters, userRole]);

    const performSearch = useCallback(async (term) => {
        if (!term) return;
        setLoading(true);
        try {
            let baseSearchRef = collection(db, "products");
            let searchConstraints = [];

            if (userRole === 'med') {
               searchConstraints.push(where("team", "==", "MED"));
            } else if (userRole === 'bio') {
                searchConstraints.push(where("team", "==", "BIO"));
            }

            const upperTerm = term.toUpperCase();
            const productSearchQuery = query(baseSearchRef, ...searchConstraints, where(documentId(), ">=", upperTerm), where(documentId(), "<=", upperTerm + '\uf8ff'));
            const lotSearchQuery = query(collection(db, "inventory_lots"), where("lotNumber", "==", term));
 
            const [productSnap, lotSnap] = await Promise.all([ getDocs(productSearchQuery), getDocs(lotSearchQuery) ]);
            
            const foundProductIds = new Set(productSnap.docs.map(doc => doc.id));
            const allowedTeams = userRole === 'med' ? ['MED'] : (userRole === 'bio' ? ['BIO'] : null);
            for (const lotDoc of lotSnap.docs) {
                const productId = lotDoc.data().productId;
                if (allowedTeams) {
                    const productRef = doc(db, "products", productId);
                    const productDoc = await getDoc(productRef);
                    if (productDoc.exists() && allowedTeams.includes(productDoc.data().team)) {
                        foundProductIds.add(productId);
                    }
                } else {
                    foundProductIds.add(productId);
                }
            }
          
            if (foundProductIds.size === 0) {
                setSummaries([]);
                setIsLastPage(true);
            } else {
                const ids = Array.from(foundProductIds).slice(0, 30);
                const finalProductsQuery = query( collection(db, "products"), where(documentId(), 'in', ids));
                const finalProductsSnap = await getDocs(finalProductsQuery);
                const finalProducts = finalProductsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const summariesQuery = query(collection(db, "product_summaries"), where(documentId(), 'in', ids));
                const summariesSnapshot = await getDocs(summariesQuery);
                const summariesMap = new Map(summariesSnapshot.docs.map(doc => [doc.id, doc.data()]));
                
                const mergedData = finalProducts.map(product => {
                    const summaryData = summariesMap.get(product.id);
                    return { ...product, totalRemaining: summaryData?.totalRemaining ?? 0, nearestExpiryDate: summaryData?.nearestExpiryDate ?? null };
                });
                setSummaries(mergedData);
                setIsLastPage(true);
            }
        } catch (error) {
            console.error("Lỗi khi tìm kiếm:", error);
        } finally {
            setLoading(false);
        }
    }, [userRole]);

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
    }, [searchTerm, filters, fetchData, performSearch]);
    
    useEffect(() => {
        const q = query(collection(db, "product_summaries"), orderBy("lastUpdatedAt", "desc"), limit(1));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (snapshot.empty) return;
            const newestDocData = snapshot.docs[0].data();
            const newestTimestamp = newestDocData.lastUpdatedAt;
            if (!newestTimestamp) return;
            if (lastSeenTimestampRef.current === null) {
                lastSeenTimestampRef.current = newestTimestamp;
                return;
            }
            if (lastSeenTimestampRef.current && newestTimestamp.toMillis() > lastSeenTimestampRef.current.toMillis()) {
                 if (!snapshot.metadata.hasPendingWrites) {
                    setHasNewData(true);
                    lastSeenTimestampRef.current = newestTimestamp;
                 }
            }
        }, (error) => {
            console.error("Lỗi khi lắng nghe real-time:", error);
        });
        return () => {
          unsubscribe();
          lastSeenTimestampRef.current = null;
        };
    }, []);

    const subGroups = useMemo(() => {
    if (userRole === 'med') {
        return SUBGROUPS_BY_TEAM.MED;
    }
    if (userRole === 'bio') {
        return SUBGROUPS_BY_TEAM.BIO;
    }
    // Dành cho admin/owner
    return ALL_SUBGROUPS;
}, [userRole]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (subGroupRef.current && !subGroupRef.current.contains(event.target)) {
                setIsSubGroupOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRefresh = () => {
        setHasNewData(false);
        fetchData('first');
    };
    
    const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({
            ...prev,
            [filterName]: prev[filterName] === value ? 'all' : value
        }));
    };

    const handleSubGroupFilter = (subGroup) => {
        setFilters(prev => ({ ...prev, subGroup: prev.subGroup === subGroup ? 'all' : subGroup }));
        setIsSubGroupOpen(false);
    };
    
    const toggleRow = async (productId) => {
    const isCurrentlyExpanded = !!expandedRows[productId];
    if (isCurrentlyExpanded) {
        setExpandedRows(prev => ({ ...prev, [productId]: false }));
        return;
    }

    setLoadingLots(prev => ({ ...prev, [productId]: true }));
    try {
        // 1. Lấy tất cả các bản ghi lô hàng còn tồn kho của sản phẩm
        const lotsQuery = query(
            collection(db, "inventory_lots"),
            where("productId", "==", productId),
            where("quantityRemaining", ">", 0)
        );
        const lotsSnapshot = await getDocs(lotsQuery);
        const allLots = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Bắt đầu gộp các lô có cùng số lô
        const lotAggregator = new Map();
        for (const lot of allLots) {
            const lotKey = lot.lotNumber || '(Không có)'; // Dùng key chung cho các lô không có số

            if (lotAggregator.has(lotKey)) {
                const existingLot = lotAggregator.get(lotKey);
                // Cộng dồn số lượng tồn
                existingLot.quantityRemaining += lot.quantityRemaining;
                // Luôn giữ lại HSD ngắn nhất cho nhóm
                if (lot.expiryDate && (!existingLot.expiryDate || lot.expiryDate.toDate() < existingLot.expiryDate.toDate())) {
                    existingLot.expiryDate = lot.expiryDate;
                }
            } else {
                // Thêm mới nếu chưa có trong Map, tạo một bản sao để tránh thay đổi dữ liệu gốc
                lotAggregator.set(lotKey, { ...lot });
            }
        }
        const aggregatedLots = Array.from(lotAggregator.values());

        // 3. Sắp xếp danh sách đã gộp theo quy tắc bạn yêu cầu
        aggregatedLots.sort((a, b) => {
            const dateA = a.expiryDate ? a.expiryDate.toDate().getTime() : Infinity;
            const dateB = b.expiryDate ? b.expiryDate.toDate().getTime() : Infinity;

            // Quy tắc 1: HSD gần nhất lên trước
            if (dateA !== dateB) {
                return dateA - dateB;
            }

            // Quy tắc 2: Nếu HSD bằng nhau, số lượng ít hơn lên trước
            return a.quantityRemaining - b.quantityRemaining;
        });

        // 4. Cập nhật state với danh sách đã được xử lý
        setLotDetails(prev => ({ ...prev, [productId]: aggregatedLots }));

    } catch (error) {
        console.error("Lỗi khi tải chi tiết lô:", error);
        toast.error("Không thể tải chi tiết các lô hàng.");
    } finally {
        setLoadingLots(prev => ({ ...prev, [productId]: false }));
    }
    setExpandedRows(prev => ({ ...prev, [productId]: true }));
};

    const handleNextPage = () => { if (!isLastPage) { setPage(p => p + 1); fetchData('next', lastVisible); } };
    const handlePrevPage = () => { fetchData('first'); };

    // src/pages/InventorySummaryPage.jsx

const filteredSummaries = useMemo(() => {
    if (filters.dateStatus !== 'near_expiry') {
        return summaries;
    }
    return summaries.filter(product => {
        const colorClass = getRowColorByExpiry(product.nearestExpiryDate, product.subGroup);
        return colorClass.includes('near-expiry') || colorClass.includes('expired');
    });
}, [summaries, filters.dateStatus]);

    return (
        <div className="printable-inventory-area">
            <NewDataNotification
                isVisible={hasNewData}
                onRefresh={handleRefresh}
                message="Có cập nhật tồn kho mới!"
            />
            
            <div className="controls-container" style={{justifyContent: 'flex-start', flexWrap: 'wrap'}}>
                {(userRole === 'owner' || userRole === 'admin') && (
                    <div className="filter-group">
                        <button className={filters.team === 'MED' ? 'active' : ''} onClick={() => handleFilterChange('team', 'MED')}>Lọc hàng MED</button>
                        <button className={filters.team === 'BIO' ? 'active' : ''} onClick={() => handleFilterChange('team', 'BIO')}>Lọc hàng BIO</button>
                    </div>
                )}
                
                <div className="filter-group">
                    <button className={filters.dateStatus === 'near_expiry' ? 'active' : ''} onClick={() => handleFilterChange('dateStatus', 'near_expiry')}>Lọc hàng cận date</button>
                    <button className={filters.dateStatus === 'expired' ? 'active' : ''} onClick={() => handleFilterChange('dateStatus', 'expired')}>Lọc hàng hết date</button>
                </div>

                <div className="filter-group" ref={subGroupRef}>
                    <div className="dropdown-filter">
                        <button onClick={() => setIsSubGroupOpen(!isSubGroupOpen)} className={filters.subGroup !== 'all' ? 'active' : ''}>
                            {filters.subGroup !== 'all' ? `Nhóm: ${filters.subGroup}` : 'Lọc theo Nhóm Hàng'}
                            <FiChevronDown style={{ marginLeft: '5px' }} />
                        </button>
                        {isSubGroupOpen && (
                            <div className="dropdown-content">
                                <button onClick={() => handleSubGroupFilter('all')}>Bỏ lọc nhóm hàng</button>
                                {subGroups.map(sg => (
                                    <button key={sg} onClick={() => handleSubGroupFilter(sg)}>
                                        {sg}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="search-container" style={{ flexGrow: 1, maxWidth: '400px' }}>
                    <input
                        type="text"
                        placeholder="Tìm theo Mã hàng..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            {loading ? <Spinner /> : (
                <>
                    <div className="table-responsive-wrapper">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th style={{width: '50px'}}></th>
                                    <th>Mã hàng</th>
                                    <th>Tên hàng</th>
                                    <th>HSD Gần Nhất</th>
                                    <th>Tổng Tồn</th>
                                    <th>ĐVT</th>
                                    <th>Quy cách</th>
                                    <th>Nhiệt độ BQ</th>
                                    <th>Hãng sản xuất</th>
                                    <th>Nhóm Hàng</th>
                                    <th>Team</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSummaries.map(product => (
                                    <React.Fragment key={product.id}>
                                        <tr 
                                            onClick={() => toggleRow(product.id)} 
                                            style={{cursor: 'pointer'}}
                                            className={getRowColorByExpiry(product.nearestExpiryDate, product.subGroup)}
                                        >
                                            <td>{expandedRows[product.id] ? <FiChevronDown /> : <FiChevronRight />}</td>
                                            <td data-label="Mã hàng"><strong><HighlightText text={product.id} highlight={searchTerm} /></strong></td>
                                            <td data-label="Tên hàng"><HighlightText text={product.productName} highlight={searchTerm} /></td>
                                            <td data-label="HSD Gần Nhất">{product.nearestExpiryDate ? formatDate(product.nearestExpiryDate) : '(Không có)'}</td>
                                            <td data-label="Tổng Tồn"><strong>{formatNumber(product.totalRemaining)}</strong></td>
                                            <td data-label="ĐVT">{product.unit}</td>
                                            <td data-label="Quy cách">{product.packaging}</td>
                                            <td data-label="Nhiệt độ BQ"><TempBadge temperature={product.storageTemp} /></td>
                                            <td data-label="Hãng sản xuất">{product.manufacturer}</td>
                                            <td data-label="Nhóm Hàng">{product.subGroup}</td>
                                            <td data-label="Team"><TeamBadge team={product.team} /></td>
                                        </tr>
                                    
                                        {expandedRows[product.id] && (
                                            <tr className="lot-details-row">
                                                <td colSpan="11">
                                                    <div className="lot-details-container">
                                                        {loadingLots[product.id] ? (
                                                            <SkeletonTheme baseColor="#e9ecef" highlightColor="#f8f9fa">
                                                                <h4><Skeleton width={200} /></h4>
                                                                <ul><li><Skeleton height={35} count={3} style={{ marginBottom: '8px' }}/></li></ul>
                                                            </SkeletonTheme>
                                                        ) : (
                                                            (lotDetails[product.id] && lotDetails[product.id].length > 0) ? (
                                                                <>
                                                                    <h4>Chi tiết các lô hàng (FEFO):</h4>
                                                                    <ul>
                                                                        {lotDetails[product.id].map(lot => (
                                                                            <li key={lot.id} className={`lot-item ${getLotItemColorClass(lot.expiryDate, product.subGroup)}`}>
                                                                                <span>Lô: <strong>{lot.lotNumber || '(Không có)'}</strong></span>
                                                                                <span>HSD: <strong>{lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'}</strong></span>
                                                                                <span>Tồn: <strong>{formatNumber(lot.quantityRemaining)}</strong></span>
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
                                <FiChevronLeft /> Về Trang Đầu
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