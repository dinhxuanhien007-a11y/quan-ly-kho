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
import { FiChevronDown, FiChevronRight, FiChevronLeft, FiDownload } from 'react-icons/fi';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { toast } from 'react-toastify';
import '../styles/Responsive.css';
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';
import HighlightText from '../components/HighlightText';
import { ALL_SUBGROUPS, SUBGROUPS_BY_TEAM, SPECIAL_EXPIRY_SUBGROUPS } from '../constants';
import { exportFullInventoryToExcel } from '../utils/excelExportUtils';

const PAGE_SIZE = 15;

// Hàm tô màu cho các lô hàng chi tiết
const getLotItemColorClass = (expiryDate, subGroup) => {
    if (!expiryDate || !expiryDate.toDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = expiryDate.toDate();
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (SPECIAL_EXPIRY_SUBGROUPS.includes(subGroup)) {
        if (diffDays < 0) return 'lot-item-expired';
        if (diffDays <= 30) return 'lot-item-red';
        if (diffDays <= 60) return 'lot-item-orange';
        if (diffDays <= 90) return 'lot-item-yellow';
    } else {
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
    
    // Đổi ref này để theo dõi thay đổi của products
    // Lưu ý: Chúng ta dùng snapshot listener trực tiếp, nên ref này có thể không cần thiết 
    // nếu logic refresh dựa trên snapshot metadata. 
    // Tuy nhiên, để giữ logic cũ hoạt động, ta sẽ giữ lại.
    const lastSeenSnapshotRef = useRef(null); 

    const [isSubGroupOpen, setIsSubGroupOpen] = useState(false);
    const subGroupRef = useRef(null);
    
    const [isExporting, setIsExporting] = useState(false);

    // --- TỐI ƯU HÓA 1: Query trực tiếp từ 'products' ---
    const fetchData = useCallback(async (direction = 'next', cursor = null) => {
        setLoading(true);
        try {
            // THAY ĐỔI QUAN TRỌNG: Đọc từ 'products'
            const baseCollectionRef = collection(db, "products");
            let queryConstraints = [];

            // 1. Lọc theo Role
            if (userRole === 'med') {
                queryConstraints.push(where("team", "==", "MED"));
            } else if (userRole === 'bio') {
                queryConstraints.push(where("team", "==", "BIO"));
            }

            // 2. Lọc theo UI
            if (filters.team !== 'all') {
                queryConstraints.push(where("team", "==", filters.team));
            }
            if (filters.subGroup !== 'all') {
                queryConstraints.push(where("subGroup", "==", filters.subGroup));
            }

            // 3. Lọc theo Date & Sắp xếp
            // Lưu ý: Trường nearestExpiryDate giờ đã có trong products nhờ script đồng bộ
            if (filters.dateStatus === 'expired') {
                queryConstraints.push(where("nearestExpiryDate", "<", Timestamp.now()));
                queryConstraints.push(orderBy("nearestExpiryDate", "desc"));
                queryConstraints.push(orderBy(documentId(), "asc"));
            } else if (filters.dateStatus === 'near_expiry') {
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 210);
                queryConstraints.push(where("nearestExpiryDate", ">=", Timestamp.now()));
                queryConstraints.push(where("nearestExpiryDate", "<=", Timestamp.fromDate(futureDate)));
                queryConstraints.push(orderBy("nearestExpiryDate", "asc"));
                queryConstraints.push(orderBy(documentId(), "asc"));
            } else {
                // Mặc định sắp xếp theo ID (Mã hàng)
                queryConstraints.push(orderBy(documentId(), "asc"));
            }

            // 4. Phân trang
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
            
            // Lấy dữ liệu trực tiếp, không cần map thêm
            const summaryDocs = mainSnapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                // Đảm bảo có giá trị mặc định nếu dữ liệu cũ chưa chuẩn
                totalRemaining: doc.data().totalRemaining ?? 0,
                nearestExpiryDate: doc.data().nearestExpiryDate ?? null
            }));
            
            setSummaries(summaryDocs);

            setLastVisible(mainSnapshot.docs[mainSnapshot.docs.length - 1] || null);
            setIsLastPage(mainSnapshot.docs.length < PAGE_SIZE);

        } catch (error) {
            console.error("Lỗi khi tải dữ liệu tổng hợp: ", error);
            if (error.message.includes('requires an index')) {
                toast.error("Lỗi truy vấn. Vui lòng kiểm tra Console để tạo Index.");
            } else {
                toast.error("Không thể tải dữ liệu.");
            }
        } finally {
            setLoading(false);
        }
    }, [filters, userRole]);

    // --- TỐI ƯU HÓA 2: Tìm kiếm gọn nhẹ hơn ---
    const performSearch = useCallback(async (term) => {
        if (!term) return;
        setLoading(true);
        try {
            const upperTerm = term.toUpperCase();
            let foundProductIds = new Set();

            // Cách 1: Tìm theo ID (Mã hàng) trong products
            // Lưu ý: Firestore không hỗ trợ tìm 'contains' (chứa), chỉ có 'startsWith'
            const productsRef = collection(db, "products");
            const idQuery = query(
                productsRef, 
                where(documentId(), ">=", upperTerm), 
                where(documentId(), "<=", upperTerm + '\uf8ff'),
                limit(30)
            );
            const idSnapshot = await getDocs(idQuery);
            idSnapshot.forEach(doc => foundProductIds.add(doc.id));

            // Cách 2: Tìm theo Số lô trong inventory_lots -> suy ra Mã hàng
            // Chỉ tìm nếu Cách 1 trả về ít kết quả để tối ưu
            if (foundProductIds.size < 5) {
                const lotsRef = collection(db, "inventory_lots");
                const lotQuery = query(lotsRef, where("lotNumber", "==", term), limit(20));
                const lotSnapshot = await getDocs(lotQuery);
                lotSnapshot.forEach(doc => foundProductIds.add(doc.data().productId));
            }

            if (foundProductIds.size === 0) {
                setSummaries([]);
                setIsLastPage(true);
            } else {
                // Lọc lại theo Role và Team (Client-side filtering cho đơn giản vì số lượng ít)
                let ids = Array.from(foundProductIds);
                
                // Fetch chi tiết các sản phẩm tìm được
                // Firestore 'in' query giới hạn 30 items
                const chunks = [];
                while (ids.length > 0) {
                    chunks.push(ids.splice(0, 30));
                }

                let finalResults = [];
                for (const chunkIds of chunks) {
                    const q = query(collection(db, "products"), where(documentId(), 'in', chunkIds));
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        const data = doc.data();
                        // Kiểm tra quyền xem user có được thấy sản phẩm này không
                        const isAllowed = 
                            (userRole === 'owner' || userRole === 'admin') ||
                            (userRole === 'med' && data.team === 'MED') ||
                            (userRole === 'bio' && data.team === 'BIO');
                        
                        if (isAllowed) {
                            finalResults.push({ 
                                id: doc.id, 
                                ...data,
                                totalRemaining: data.totalRemaining ?? 0,
                                nearestExpiryDate: data.nearestExpiryDate ?? null
                            });
                        }
                    });
                }
                
                setSummaries(finalResults);
                setIsLastPage(true); // Tìm kiếm thì không phân trang tiếp
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
    
    // --- TỐI ƯU HÓA 3: Realtime Listener trên 'product_summaries' hoặc 'products' ---
    // Để tránh tốn kém, ta vẫn lắng nghe 'product_summaries' vì nó chỉ thay đổi khi tồn kho đổi.
    // (Cloud Function vẫn update summary song song với products)
    // Biến cờ để kiểm tra xem có phải lần load đầu tiên không
    const isFirstRun = useRef(true);

    useEffect(() => {
        const q = query(collection(db, "product_summaries"), orderBy("lastUpdatedAt", "desc"), limit(1));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            // 1. Nếu là lần chạy đầu tiên (vừa vào trang), ta bỏ qua không thông báo
            if (isFirstRun.current) {
                isFirstRun.current = false;
                return;
            }

            if (snapshot.empty) return;
            
            // 2. Từ lần thứ 2 trở đi, nếu có thay đổi mới báo
            if (!snapshot.metadata.hasPendingWrites) {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added" || change.type === "modified") {
                         setHasNewData(true);
                    }
                });
            }
        }, (error) => {
            console.error("Lỗi khi lắng nghe real-time:", error);
        });
        return () => unsubscribe();
    }, []);

    const subGroups = useMemo(() => {
        if (userRole === 'med') return SUBGROUPS_BY_TEAM.MED;
        if (userRole === 'bio') return SUBGROUPS_BY_TEAM.BIO;
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
            const lotsQuery = query(
                collection(db, "inventory_lots"),
                where("productId", "==", productId),
                where("quantityRemaining", ">", 0)
            );
            const lotsSnapshot = await getDocs(lotsQuery);
            const allLots = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const lotAggregator = new Map();
            for (const lot of allLots) {
                const lotKey = lot.lotNumber || '(Không có)';
                if (lotAggregator.has(lotKey)) {
                    const existingLot = lotAggregator.get(lotKey);
                    existingLot.quantityRemaining += lot.quantityRemaining;
                    if (lot.expiryDate && (!existingLot.expiryDate || lot.expiryDate.toDate() < existingLot.expiryDate.toDate())) {
                        existingLot.expiryDate = lot.expiryDate;
                    }
                } else {
                    lotAggregator.set(lotKey, { ...lot });
                }
            }
            const aggregatedLots = Array.from(lotAggregator.values());

            // Logic sắp xếp an toàn (Đã sửa từ trước)
            aggregatedLots.sort((a, b) => {
                const getTime = (dateObj) => {
                    if (!dateObj) return Infinity;
                    if (typeof dateObj.toDate === 'function') return dateObj.toDate().getTime();
                    if (dateObj instanceof Date) return dateObj.getTime();
                    return Infinity;
                };
                const dateA = getTime(a.expiryDate);
                const dateB = getTime(b.expiryDate);
                if (dateA !== dateB) return dateA - dateB;
                return a.quantityRemaining - b.quantityRemaining;
            });

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

    const filteredSummaries = useMemo(() => {
        if (filters.dateStatus !== 'near_expiry') {
            return summaries;
        }
        return summaries.filter(product => {
            const colorClass = getRowColorByExpiry(product.nearestExpiryDate, product.subGroup);
            return colorClass.includes('near-expiry') || colorClass.includes('expired');
        });
    }, [summaries, filters.dateStatus]);

    const handleExportExcel = async () => {
        if (userRole !== 'owner') return;
        setIsExporting(true);
        toast.info("Đang tạo file Excel toàn bộ tồn kho...");

        try {
            await exportFullInventoryToExcel();
            toast.success("Xuất file Excel thành công!");
        } catch (error) {
            toast.error("Có lỗi xảy ra khi xuất file.");
        } finally {
            setIsExporting(false);
        }
    };
    
    const ALLOWED_EXPORT_ROLES = ['owner']; 
    const canExport = ALLOWED_EXPORT_ROLES.includes(userRole);

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

                {canExport && (
                    <button 
                        onClick={handleExportExcel} 
                        className="btn-success"
                        disabled={isExporting}
                        style={{ 
                            marginLeft: '10px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '5px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            padding: '10px 15px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        <FiDownload /> 
                        {isExporting ? 'Đang xuất...' : 'Xuất Excel (Full)'}
                    </button>
                )}
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