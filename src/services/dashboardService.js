// src/services/dashboardService.js
import { collection, getDocs, query, where, orderBy, limit, Timestamp, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { formatDate } from '../utils/dateUtils';

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
export const getProductLedger = async (productId) => {
    if (!productId) {
        throw new Error("Mã hàng không được để trống.");
    }

    const upperProductId = productId.toUpperCase().trim();
    let transactions = [];

    // Lấy tất cả các lô hàng (bao gồm tồn đầu kỳ và các lần nhập)
    const allLotsQuery = query(
        collection(db, 'inventory_lots'),
        where('productId', '==', upperProductId)
    );

    // Lấy tất cả các phiếu xuất đã hoàn thành
    const exportQuery = query(
        collection(db, 'export_tickets'),
        where('status', '==', 'completed'),
        where('productIds', 'array-contains', upperProductId)
    );

    const [allLotsSnap, exportSnap] = await Promise.all([
        getDocs(allLotsQuery),
        getDocs(exportQuery)
    ]);

    // Xử lý tất cả các lần nhập kho
    allLotsSnap.forEach(doc => {
        const lot = doc.data();
        // SỬA LẠI: Kiểm tra cả `supplier` và `supplierName`
        const isOpeningStock = lot.supplierName === 'Tồn đầu kỳ' || lot.supplier === 'Tồn đầu kỳ';
        
        transactions.push({
            date: lot.importDate.toDate(),
            docId: doc.id,
            isLot: true,
            type: 'NHẬP',
            // SỬA LẠI: Dùng biến isOpeningStock để xác định description
            description: isOpeningStock ? 'Nhập tồn kho đầu kỳ' : `Nhập từ: ${lot.supplierName || lot.supplier || '(Không rõ)'}`,
            importQty: Number(lot.quantityImported),
            exportQty: 0,
            lotNumber: lot.lotNumber,
            expiryDate: lot.expiryDate ? formatDate(lot.expiryDate) : ''
        });
    });

    // Xử lý tất cả các lần xuất kho
    exportSnap.forEach(doc => {
        const slip = doc.data();
        slip.items.forEach(item => {
            if (item.productId === upperProductId) {
                transactions.push({
                    date: slip.createdAt.toDate(),
                    docId: doc.id,
                    isTicket: true,
                    type: 'XUẤT',
                    description: `Xuất cho: ${slip.customer}`,
                    importQty: 0,
                    exportQty: Number(item.quantityToExport || item.quantityExported),
                    lotNumber: item.lotNumber,
                    expiryDate: item.expiryDate
                });
            }
        });
    });

    // Sắp xếp tất cả giao dịch theo ngày tháng
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    // --- LOGIC TÍNH TOÁN CUỐI CÙNG ---
    let openingBalance = 0;
    let totalImport = 0;
    let totalExport = 0;
    let currentBalance = 0;

    const openingTxns = transactions.filter(tx => tx.description === 'Nhập tồn kho đầu kỳ');
    openingBalance = openingTxns.reduce((sum, tx) => sum + tx.importQty, 0);

    const inPeriodImports = transactions.filter(tx => tx.type === 'NHẬP' && tx.description !== 'Nhập tồn kho đầu kỳ');
    totalImport = inPeriodImports.reduce((sum, tx) => sum + tx.importQty, 0);

    const inPeriodExports = transactions.filter(tx => tx.type === 'XUẤT');
    totalExport = inPeriodExports.reduce((sum, tx) => sum + tx.exportQty, 0);
    
    const ledgerRows = [];
    currentBalance = 0;
    transactions.forEach(tx => {
        currentBalance += (tx.importQty - tx.exportQty);
        ledgerRows.push({ ...tx, balance: currentBalance });
    });

    return {
        openingBalance,
        totalImport,
        totalExport,
        closingBalance: currentBalance,
        rows: ledgerRows
    };
};