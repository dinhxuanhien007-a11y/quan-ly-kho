// src/pages/InventorySummaryPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, getDocs, where, orderBy, documentId, limit, startAfter, Timestamp } from 'firebase/firestore';
import { formatDate } from '../utils/dateUtils';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { FiChevronDown, FiChevronRight, FiChevronLeft } from 'react-icons/fi';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 15;

const getRowColorByExpiry = (expiryDate) => {
    if (!expiryDate || !expiryDate.toDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = expiryDate.toDate();
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'expired-black';
    if (diffDays <= 60) return 'near-expiry-red';
    if (diffDays <= 90) return 'near-expiry-orange';
    if (diffDays <= 120) return 'near-expiry-yellow';
    return '';
};

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
    
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    const [isLastPage, setIsLastPage] = useState(false);
    const [activeFilter, setActiveFilter] = useState({ type: 'none', value: '' });

    const performSearch = async (term) => {
        if (!term) {
            fetchData('first');
            return;
        }
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
    };

    const fetchData = useCallback(async (direction = 'next') => {
        setLoading(true);
        try {
            let q = query(collection(db, "product_summaries"), orderBy("nearestExpiryDate", "asc"));

            if (activeFilter.type === 'team') {
                q = query(q, where("team", "==", activeFilter.value));
            } else if (activeFilter.type === 'near_expiry') {
                const today = Timestamp.now();
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 120);
                const futureTimestamp = Timestamp.fromDate(futureDate);
                q = query(q, where("nearestExpiryDate", ">=", today), where("nearestExpiryDate", "<=", futureTimestamp));
            } else if (activeFilter.type === 'expired') {
                const today = Timestamp.now();
                q = query(q, where("nearestExpiryDate", "<", today));
            }

            if (direction === 'next' && lastVisible) {
                q = query(q, startAfter(lastVisible), limit(PAGE_SIZE));
            } else {
                q = query(q, limit(PAGE_SIZE));
                setPage(1);
            }

            const docSnapshots = await getDocs(q);
            const summaryList = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setSummaries(summaryList);

        } catch (error) {
            console.error("Lỗi khi tải dữ liệu tổng hợp: ", error);
        } finally {
            setLoading(false);
        }
    }, [lastVisible, activeFilter]);

    useEffect(() => {
        const debounce = setTimeout(() => {
            setLastVisible(null);
            if (searchTerm) {
                performSearch(searchTerm);
            } else {
                fetchData('first');
            }
        }, 500);
        return () => clearTimeout(debounce);
    }, [searchTerm, activeFilter]);

    const toggleRow = async (productId) => {
        const isCurrentlyExpanded = expandedRows[productId];
        setExpandedRows(prev => ({ ...prev, [productId]: !isCurrentlyExpanded }));
        if (!isCurrentlyExpanded && !lotDetails[productId]) {
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
            }
        }
    };

    const handleNextPage = () => {
        if (!isLastPage) {
            setPage(p => p + 1);
            fetchData('next');
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
    
    return (
        <div>
            <div className="page-header">
                <h1>Tồn Kho Tổng Hợp</h1>
            </div>
            
            <div className="filters-container" style={{justifyContent: 'flex-start', flexWrap: 'wrap'}}>
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
                                            <td><strong>{product.id}</strong></td>
                                            <td style={{textAlign: 'left'}}>{product.productName}</td>
                                            <td>{formatDate(product.nearestExpiryDate)}</td>
                                            <td><strong>{product.totalRemaining}</strong></td>
                                            <td>{product.unit}</td>
                                            <td><TempBadge temperature={product.storageTemp} /></td>
                                            <td><TeamBadge team={product.team} /></td>
                                        </tr>
                                        {expandedRows[product.id] && (
                                            <tr className="lot-details-row">
                                                <td colSpan="8">
                                                    <div className="lot-details-container">
                                                        {lotDetails[product.id] ? (
                                                            lotDetails[product.id].length > 0 ? (
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
                                                        ) : <p>Đang tải chi tiết lô...</p>}
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
                            <button onClick={() => { setLastVisible(null); fetchData('first'); }} disabled={page <= 1}>
                                <FiChevronLeft /> Trang Trước
                            </button>
                            <span>Trang {page}</span>
                            <button onClick={() => fetchData('next')} disabled={isLastPage}>
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