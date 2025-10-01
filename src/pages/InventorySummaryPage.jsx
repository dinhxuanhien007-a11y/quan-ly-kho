// src/pages/InventorySummaryPage.jsx

import { formatNumber } from '../utils/numberUtils';
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { FiChevronDown, FiChevronRight, FiChevronLeft, FiPrinter } from 'react-icons/fi';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { toast } from 'react-toastify';
import '../styles/Responsive.css';
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';
import HighlightText from '../components/HighlightText';
import companyLogo from '../assets/logo.png'; // <-- THÊM DÒNG NÀY

const PAGE_SIZE = 15;

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
    const [activeFilter, setActiveFilter] = useState({ type: 'none', value: '' });
    
    // State và Ref cho thông báo real-time
    const [hasNewData, setHasNewData] = useState(false);
    const lastSeenTimestampRef = useRef(null); // Sử dụng lại ref để lưu timestamp

    const fetchData = useCallback(async (direction = 'next', cursor = null) => {
        setLoading(true);
        try {
            let baseCollectionRef;
            let queryConstraints = [];
            const isDateFilter = activeFilter.type === 'near_expiry' || activeFilter.type === 'expired';

            if (userRole === 'med') {
                queryConstraints.push(where("team", "==", "MED"));
            } else if (userRole === 'bio') {
                queryConstraints.push(where("team", "in", ["BIO", "Spare Part"]));
            }
            
            if (isDateFilter) {
                baseCollectionRef = collection(db, "product_summaries");
                if (activeFilter.type === 'near_expiry') {
                    const today = Timestamp.now();
                    const futureDate = new Date();
                    futureDate.setDate(futureDate.getDate() + 120);
                    const futureTimestamp = Timestamp.fromDate(futureDate);
                    queryConstraints.push(where("nearestExpiryDate", ">=", today));
                    queryConstraints.push(where("nearestExpiryDate", "<=", futureTimestamp));
                    queryConstraints.push(orderBy("nearestExpiryDate", "asc"));
                } else {
                    const today = Timestamp.now();
                    queryConstraints.push(where("nearestExpiryDate", "<", today));
                    queryConstraints.push(orderBy("nearestExpiryDate", "asc"));
                }
            } else {
                baseCollectionRef = collection(db, "products");
                if (activeFilter.type === 'team') {
                    queryConstraints.push(where("team", "==", activeFilter.value));
                }
                queryConstraints.push(orderBy(documentId(), "asc"));
            }

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
                setLoading(false);
                return;
            }

            const mainDocs = mainSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (isDateFilter) {
                setSummaries(mainDocs);
            } else {
                const productIds = mainDocs.map(doc => doc.id);
                if (productIds.length > 0) {
                    const summariesQuery = query(collection(db, "product_summaries"), where(documentId(), 'in', productIds));
                    const summariesSnapshot = await getDocs(summariesQuery);
                    const summariesMap = new Map(summariesSnapshot.docs.map(doc => [doc.id, doc.data()]));
                    const mergedData = mainDocs.map(product => {
                        const summaryData = summariesMap.get(product.id);
                        return { ...product, totalRemaining: summaryData?.totalRemaining ?? 0, nearestExpiryDate: summaryData?.nearestExpiryDate ?? null };
                    });
                    setSummaries(mergedData);
                } else {
                    setSummaries([]);
                }
            }

            setLastVisible(mainSnapshot.docs[mainSnapshot.docs.length - 1] || null);
            setIsLastPage(mainSnapshot.docs.length < PAGE_SIZE);

        } catch (error) {
            console.error("Lỗi khi tải dữ liệu tổng hợp: ", error);
            toast.error("Không thể tải dữ liệu. Vui lòng kiểm tra Console (F12) để xem lỗi và tạo Index nếu cần.");
        } finally {
            setLoading(false);
        }
    }, [activeFilter, userRole]);

    const performSearch = useCallback(async (term) => {
        if (!term) return;
        setLoading(true);
        try {
            let baseSearchRef = collection(db, "products");
            let searchConstraints = [];

            if (userRole === 'med') {
               searchConstraints.push(where("team", "==", "MED"));
            } else if (userRole === 'bio') {
                searchConstraints.push(where("team", "in", ["BIO", "Spare Part"]));
            }

            const upperTerm = term.toUpperCase();
            const productSearchQuery = query(baseSearchRef, ...searchConstraints, where(documentId(), ">=", upperTerm), where(documentId(), "<=", upperTerm + '\uf8ff'));
            const lotSearchQuery = query(collection(db, "inventory_lots"), where("lotNumber", "==", term));
 
            const [productSnap, lotSnap] = await Promise.all([ getDocs(productSearchQuery), getDocs(lotSearchQuery) ]);
            
            const foundProductIds = new Set(productSnap.docs.map(doc => doc.id));
            const allowedTeams = userRole === 'med' ? ['MED'] : (userRole === 'bio' ? ['BIO', 'Spare Part'] : null);
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
    }, [searchTerm, activeFilter, fetchData, performSearch]);

    // === LOGIC LẮNG NGHE REAL-TIME ĐÃ ĐƯỢC SỬA LẠI ===
    useEffect(() => {
        const q = query(collection(db, "product_summaries"), orderBy("lastUpdatedAt", "desc"), limit(1));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (snapshot.empty) return;

            const newestDocData = snapshot.docs[0].data();
            const newestTimestamp = newestDocData.lastUpdatedAt;

            // Nếu không có timestamp thì không xử lý
            if (!newestTimestamp) return;
            
            // Lần đầu tiên listener chạy, chỉ ghi lại timestamp và thoát
            if (lastSeenTimestampRef.current === null) {
                lastSeenTimestampRef.current = newestTimestamp;
                return;
            }

            // Từ lần thứ hai trở đi, so sánh timestamp mới với cái đã lưu
            if (lastSeenTimestampRef.current && newestTimestamp.toMillis() > lastSeenTimestampRef.current.toMillis()) {
                // Chỉ hiện thông báo nếu sự thay đổi không phải từ cache của chính client này
                 if (!snapshot.metadata.hasPendingWrites) {
                   setHasNewData(true);
                   // Cập nhật lại timestamp đã thấy để không báo lại cho cùng một sự kiện
                   lastSeenTimestampRef.current = newestTimestamp;
                 }
            }
        }, (error) => {
            console.error("Lỗi khi lắng nghe real-time:", error);
        });

        return () => {
          unsubscribe();
          // Reset ref khi component unmount để lần sau vào lại nó sẽ thiết lập lại từ đầu
          lastSeenTimestampRef.current = null;
        };
    }, []);

    const handleRefresh = () => {
        setHasNewData(false);
        fetchData('first');
    };
    
     const toggleRow = async (productId) => {
        const isCurrentlyExpanded = !!expandedRows[productId];
        // LUÔN LUÔN TẢI LẠI DỮ LIỆU LÔ KHI BẤM VÀO ĐỂ ĐẢM BẢO TÍNH TỨC THỜI
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
            // --- LOGIC GỘP LÔ BẮT ĐẦU TỪ ĐÂY ---
            const lotAggregator = new Map();

            for (const lot of lots) {
                const lotKey = lot.lotNumber || 'KHONG_CO_LO';

                if (lotAggregator.has(lotKey)) {
                    // Nếu lô đã có, cộng dồn số lượng
                    const existingLot = lotAggregator.get(lotKey);
                    existingLot.quantityRemaining += lot.quantityRemaining;
                } else {
                    // Nếu lô chưa có, thêm mới vào Map
                    // Tạo một bản sao để không làm thay đổi dữ liệu gốc
                    lotAggregator.set(lotKey, { ...lot });
                }
            }
            const aggregatedLots = Array.from(lotAggregator.values());
setLotDetails(prev => ({ ...prev, [productId]: aggregatedLots })); // <-- Sửa "lots" thành "aggregatedLots"
        } catch (error) {
            console.error("Lỗi khi tải chi tiết lô:", error);
            setLotDetails(prev => ({ ...prev, [productId]: [] }));
        } finally {
            setLoadingLots(prev => ({ ...prev, [productId]: false }));
        }
        
        setExpandedRows(prev => ({ ...prev, [productId]: !isCurrentlyExpanded }));
    };

    const handleNextPage = () => { if (!isLastPage) { setPage(p => p + 1); fetchData('next', lastVisible); } };
    const handlePrevPage = () => {
    // Luôn quay về trang đầu tiên, là cách hoạt động đơn giản và ổn định nhất
    // với cursor-based pagination của Firestore khi chỉ tiến tới.
    fetchData('first'); 
};
    const handleFilterChange = (type, value = '') => { if (activeFilter.type === type && activeFilter.value === value) { setActiveFilter({ type: 'none', value: '' }); } else { setActiveFilter({ type, value }); } };
    
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
        const allExpanded = allProductIds.reduce((acc, id) => ({...acc, [id]: true}), {});
        setExpandedRows(allExpanded);
        
        setTimeout(() => {
            window.print();
            document.title = originalTitle;
            setExpandedRows({});
        }, 500);
    };

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
                        <button className={activeFilter.value === 'MED' ? 'active' : ''} onClick={() => handleFilterChange('team', 'MED')}>Lọc hàng MED</button>
                        <button className={activeFilter.value === 'BIO' ? 'active' : ''} onClick={() => handleFilterChange('team', 'BIO')}>Lọc hàng BIO</button>
                        <button className={activeFilter.value === 'Spare Part' ? 'active' : ''} onClick={() => handleFilterChange('team', 'Spare Part')}>Lọc hàng Spare Part</button>
                    </div>
                )}
                
                {userRole === 'bio' && (
                     <div className="filter-group">
                        <button className={activeFilter.value === 'Spare Part' ? 'active' : ''} onClick={() => handleFilterChange('team', 'Spare Part')}>Lọc hàng Spare Part</button>
                    </div>
                )}

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
                                            <td data-label="Mã hàng">
    <strong>
        <HighlightText text={product.id} highlight={searchTerm} />
    </strong>
</td>
                                            <td data-label="Tên hàng">
    <HighlightText text={product.productName} highlight={searchTerm} />
</td>
                                            <td data-label="HSD Gần Nhất">{product.nearestExpiryDate ? formatDate(product.nearestExpiryDate) : '(Không có)'}</td>
                                            <td data-label="Tổng Tồn"><strong>{formatNumber(product.totalRemaining)}</strong></td>
                                            <td data-label="ĐVT">{product.unit}</td>
                                            <td data-label="Quy cách">{product.packaging}</td>
                                            <td data-label="Nhiệt độ BQ"><TempBadge temperature={product.storageTemp} /></td>
                                            <td data-label="Team"><TeamBadge team={product.team} /></td>
                                        </tr>
                             
                                        {expandedRows[product.id] && (
                                            <tr className="lot-details-row">
                                                <td colSpan="9">
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