// src/services/dashboardService.js
import { collection, getDocs, query, where, orderBy, limit, Timestamp, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { formatDate, parseDateString } from '../utils/dateUtils';

// --- BẮT ĐẦU THÊM LẠI CÁC HÀM BỊ THIẾU ---

/**
 * Lấy danh sách các phiếu nhập đang ở trạng thái "pending".
 */
export const getPendingImportTickets = async () => {
    const ticketsQuery = query(
        collection(db, 'import_tickets'),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc"),
        limit(15)
    );
    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Lấy danh sách các phiếu xuất đang ở trạng thái "pending".
 */
export const getPendingExportTickets = async () => {
    const ticketsQuery = query(
        collection(db, 'export_tickets'),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc"),
        limit(15)
    );
    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- KẾT THÚC PHẦN THÊM LẠI ---


/**
 * Lấy các thống kê nhanh cho Dashboard.
 */
export const getDashboardStats = async () => {
    // 1. Đếm số lô sắp hết hạn (trong 120 ngày tới)
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 120);
    const nearExpiryQuery = query(
        collection(db, "inventory_lots"),
        where("expiryDate", ">=", Timestamp.now()),
        where("expiryDate", "<=", Timestamp.fromDate(futureDate))
    );
    const nearExpirySnap = await getCountFromServer(nearExpiryQuery);

    // 2. Đếm số lô đã hết hạn
    const expiredQuery = query(
        collection(db, "inventory_lots"),
        where("expiryDate", "<", Timestamp.now())
    );
    const expiredSnap = await getCountFromServer(expiredQuery);

    // 3. Đếm tổng số mã hàng (SKU)
    const productsQuery = query(collection(db, "products"));
    const productsSnap = await getCountFromServer(productsQuery);
    
    // 4. Đếm tổng số đối tác
    const partnersQuery = query(collection(db, "partners"));
    const partnersSnap = await getCountFromServer(partnersQuery);

    return {
        nearExpiryCount: nearExpirySnap.data().count,
        expiredCount: expiredSnap.data().count,
        skuCount: productsSnap.data().count,
        partnerCount: partnersSnap.data().count,
    };
};

/**
 * Lấy danh sách các phiếu nhập đã hoàn thành gần đây.
 */
export const getRecentCompletedImports = async (count = 5) => {
    const ticketsQuery = query(
        collection(db, 'import_tickets'),
        where("status", "==", "completed"),
        orderBy("createdAt", "desc"),
        limit(count)
    );
    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Lấy danh sách các phiếu xuất đã hoàn thành gần đây.
 */
export const getRecentCompletedExports = async (count = 5) => {
    const ticketsQuery = query(
        collection(db, 'export_tickets'),
        where("status", "==", "completed"),
        orderBy("createdAt", "desc"),
        limit(count)
    );
    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Lấy dữ liệu cho các biểu đồ.
 */
export const getChartData = async () => {
    // 1. Dữ liệu cho biểu đồ HSD
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 120);

    const safeQuery = query(collection(db, "inventory_lots"), where("expiryDate", ">", Timestamp.fromDate(futureDate)));
    const nearExpiryQuery = query(collection(db, "inventory_lots"), where("expiryDate", ">=", Timestamp.now()), where("expiryDate", "<=", Timestamp.fromDate(futureDate)));
    const expiredQuery = query(collection(db, "inventory_lots"), where("expiryDate", "<", Timestamp.now()));

    const [safeSnap, nearExpirySnap, expiredSnap] = await Promise.all([
        getCountFromServer(safeQuery),
        getCountFromServer(nearExpiryQuery),
        getCountFromServer(expiredQuery),
    ]);
    
    const expiryData = {
        safe: safeSnap.data().count,
        near_expiry: nearExpirySnap.data().count,
        expired: expiredSnap.data().count,
    };

    // 2. Dữ liệu cho biểu đồ Team
    const productsSnapshot = await getDocs(collection(db, "products"));
    const teamCounts = { MED: 0, BIO: 0, 'Spare Part': 0 };
    productsSnapshot.forEach(doc => {
        const team = doc.data().team;
        if (team in teamCounts) {
            teamCounts[team]++;
        }
    });

    return { expiryData, teamData: teamCounts };
};

/**
 * Lấy và xử lý dữ liệu phân tích bán hàng dựa trên bộ lọc.
 * @param {object} filters - Đối tượng chứa các bộ lọc { startDate, endDate, customerId, productId }.
 * @returns {Promise<Array>} - Một mảng chứa các dòng dữ liệu đã được xử lý.
 */
export const getSalesAnalytics = async (filters = {}) => {
    let salesQuery = query(
        collection(db, 'export_tickets'),
        where("status", "==", "completed"),
        orderBy("createdAt", "desc")
    );

    // Áp dụng bộ lọc
    if (filters.startDate) {
        salesQuery = query(salesQuery, where("createdAt", ">=", Timestamp.fromDate(new Date(filters.startDate))));
    }
    if (filters.endDate) {
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        salesQuery = query(salesQuery, where("createdAt", "<=", Timestamp.fromDate(endOfDay)));
    }
    if (filters.customerId) {
        salesQuery = query(salesQuery, where("customerId", "==", filters.customerId));
    }
    // SỬA LẠI: BẬT BỘ LỌC CHO PRODUCT ID
    if (filters.productId && filters.productId.trim() !== '') {
        salesQuery = query(salesQuery, where("productIds", "array-contains", filters.productId.trim()));
    }

    const querySnapshot = await getDocs(salesQuery);

    // Xử lý và làm phẳng dữ liệu
    const detailedRows = [];
    querySnapshot.forEach(doc => {
        const slip = doc.data();
        slip.items.forEach(item => {
            // SỬA LẠI: NẾU CÓ LỌC THEO MÃ HÀNG, CHỈ LẤY ĐÚNG MẶT HÀNG ĐÓ
            if (filters.productId && filters.productId.trim() !== '' && item.productId !== filters.productId.trim()) {
                return; // Bỏ qua các mặt hàng không khớp
            }
            detailedRows.push({
                slipId: doc.id,
                exportDate: slip.createdAt,
                customer: slip.customer,
                productId: item.productId,
                productName: item.productName,
                lotNumber: item.lotNumber,
                quantityExported: item.quantityToExport || item.quantityExported,
                unit: item.unit
            });
        });
    });

    return detailedRows;
};

/**
 * Lấy toàn bộ lịch sử giao dịch (thẻ kho) cho một mã hàng.
 * @param {string} productId - Mã hàng cần truy vấn.
 * @returns {Promise<object>} - Dữ liệu thẻ kho đã xử lý.
 */
// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

export const getProductLedger = async (productId, lotNumberFilter, startDate, endDate) => {
    if (!productId) {
        throw new Error("Mã hàng không được để trống.");
    }

    const upperProductId = productId.toUpperCase().trim();
    const startDateObj = startDate ? new Date(startDate) : null;
    let openingBalance = 0;

    // --- BƯỚC 1: TÍNH TỒN ĐẦU KỲ ---
    const cutoffDate = startDateObj ? Timestamp.fromDate(startDateObj) : null;

    if (cutoffDate) {
        // Lấy TẤT CẢ các lần nhập kho trước ngày bắt đầu, không phân biệt NCC
        const openingImportsQuery = query(
            collection(db, 'inventory_lots'),
            where('productId', '==', upperProductId),
            where("importDate", "<", cutoffDate)
        );
        const openingExportsQuery = query(
            collection(db, 'export_tickets'),
            where('status', '==', 'completed'),
            where('productIds', 'array-contains', upperProductId),
            where("createdAt", "<", cutoffDate)
        );

        const [openingImportsSnap, openingExportsSnap] = await Promise.all([
            getDocs(openingImportsQuery),
            getDocs(openingExportsQuery)
        ]);

        const totalImportedBefore = openingImportsSnap.docs.reduce((sum, doc) => {
            const lot = doc.data();
            return (!lotNumberFilter || lot.lotNumber === lotNumberFilter) ? sum + lot.quantityImported : sum;
        }, 0);
        
        let totalExportedBefore = 0;
        openingExportsSnap.forEach(doc => {
            doc.data().items.forEach(item => {
                if (item.productId === upperProductId && (!lotNumberFilter || item.lotNumber === lotNumberFilter)) {
                    totalExportedBefore += Number(item.quantityToExport || item.quantityExported);
                }
            });
        });
        openingBalance = totalImportedBefore - totalExportedBefore;
    }

    // --- BƯỚC 2: LẤY CÁC GIAO DỊCH TRONG KỲ ---
    let transactions = [];

    // Tạo các điều kiện lọc chung
    const dateFiltersCreatedAt = [];
    if (startDate) dateFiltersCreatedAt.push(where("createdAt", ">=", Timestamp.fromDate(new Date(startDate))));
    if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        dateFiltersCreatedAt.push(where("createdAt", "<=", Timestamp.fromDate(endOfDay)));
    }

    const lotDateFilters = [];
    if (startDate) lotDateFilters.push(where("importDate", ">=", Timestamp.fromDate(new Date(startDate))));
    if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        lotDateFilters.push(where("importDate", "<=", Timestamp.fromDate(endOfDay)));
    }
    
    // Lọc phiếu nhập và xuất từ tickets
    const importQuery = query(collection(db, 'import_tickets'), where('status', '==', 'completed'), where('productIds', 'array-contains', upperProductId), ...dateFiltersCreatedAt);
    const exportQuery = query(collection(db, 'export_tickets'), where('status', '==', 'completed'), where('productIds', 'array-contains', upperProductId), ...dateFiltersCreatedAt);
    
    // Lọc Tồn Đầu Kỳ từ inventory_lots, kiểm tra cả 2 biến thể tên và 2 biến thể giá trị
    const baseLotConstraints = [where('productId', '==', upperProductId)];
    if(lotNumberFilter) baseLotConstraints.push(where('lotNumber', '==', lotNumberFilter));
    
    const tdkQueries = [
        query(collection(db, 'inventory_lots'), ...baseLotConstraints, where('supplierName', '==', 'Tồn đầu kỳ'), ...lotDateFilters),
        query(collection(db, 'inventory_lots'), ...baseLotConstraints, where('supplierName', '==', 'Tồn kho đầu kỳ'), ...lotDateFilters),
        query(collection(db, 'inventory_lots'), ...baseLotConstraints, where('supplier', '==', 'Tồn đầu kỳ'), ...lotDateFilters),
        query(collection(db, 'inventory_lots'), ...baseLotConstraints, where('supplier', '==', 'Tồn kho đầu kỳ'), ...lotDateFilters),
    ];

    const [importSnap, exportSnap, ...tdkSnaps] = await Promise.all([
        getDocs(importQuery),
        getDocs(exportQuery),
        ...tdkQueries.map(q => getDocs(q))
    ]);

    // Xử lý các lần nhập kho từ phiêú
    importSnap.forEach(doc => {
        const slip = doc.data();
        slip.items.forEach(item => {
            if (item.productId === upperProductId && (!lotNumberFilter || item.lotNumber === lotNumberFilter)) {
                transactions.push({
                    date: slip.createdAt.toDate(), docId: doc.id, isTicket: true, type: 'NHẬP',
                    description: `Nhập từ: ${slip.supplierName}`, importQty: Number(item.quantity), exportQty: 0,
                    lotNumber: item.lotNumber, expiryDate: item.expiryDate, expiryDateObject: parseDateString(item.expiryDate)
                });
            }
        });
    });

    // Xử lý các lần nhập "Tồn (kho) đầu kỳ"
    tdkSnaps.forEach(snap => {
        snap.forEach(doc => {
            const lot = doc.data();
            // Chỉ thêm vào giao dịch nếu nó chưa được tính vào tồn đầu kỳ.
            if (!startDateObj) {
                transactions.push({
                    date: lot.importDate.toDate(), docId: `(Tồn đầu kỳ - Lô ${doc.id.substring(0,5)})`, isTicket: false, 
                    type: 'NHẬP', description: `Nhập từ: ${lot.supplierName || lot.supplier}`, importQty: Number(lot.quantityImported),
                    exportQty: 0, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate ? formatDate(lot.expiryDate) : '',
                    expiryDateObject: lot.expiryDate
                });
            }
        });
    });

    // Xử lý các lần xuất kho
    exportSnap.forEach(doc => {
        const slip = doc.data();
        slip.items.forEach(item => {
            if (item.productId === upperProductId && (!lotNumberFilter || item.lotNumber === lotNumberFilter)) {
                transactions.push({
                    date: slip.createdAt.toDate(), docId: doc.id, isTicket: true, type: 'XUẤT',
                    description: `Xuất cho: ${slip.customer}`, importQty: 0,
                    exportQty: Number(item.quantityToExport || item.quantityExported),
                    lotNumber: item.lotNumber, expiryDate: item.expiryDate,
                    expiryDateObject: parseDateString(item.expiryDate)
                });
            }
        });
    });

    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // --- BƯỚC 3: TÍNH TOÁN SỐ DƯ ---
    const totalImport = transactions.reduce((sum, tx) => sum + tx.importQty, 0);
    const totalExport = transactions.reduce((sum, tx) => sum + tx.exportQty, 0);

    let currentBalance = openingBalance;
    const ledgerRows = [];

    transactions.forEach(tx => {
        currentBalance += (tx.importQty - tx.exportQty);
        ledgerRows.push({ ...tx, balance: currentBalance });
    });

    return {
        openingBalance, totalImport, totalExport,
        closingBalance: currentBalance,
        rows: ledgerRows
    };
};