// src/hooks/useProductLedger.js
import { useState, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { getProductLedger } from '../services/dashboardService';
import { toast } from 'react-toastify';

export const useProductLedger = () => {
    const [productInfo, setProductInfo] = useState(null);
    const [ledgerData, setLedgerData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [lotNumberFilter, setLotNumberFilter] = useState(null);

    const search = useCallback(async (filters) => {
        const term = filters.productId.trim();
        if (!term) {
            toast.warn("Vui lòng chọn một sản phẩm hoặc nhập một số lô.");
            return;
        }

        setLoading(true);
        setLedgerData(null);
        setProductInfo(null);
        setLotNumberFilter(null);

        try {
            let foundProductId = null;
            let foundProductData = null;
            let tempLotFilter = null;

            const lotQuery = query(collection(db, 'inventory_lots'), where('lotNumber', '==', term), limit(1));
            const lotSnap = await getDocs(lotQuery);

            if (!lotSnap.empty) {
                foundProductId = lotSnap.docs[0].data().productId;
                tempLotFilter = term;
            } else {
                foundProductId = term.toUpperCase();
            }
            
            setLotNumberFilter(tempLotFilter);

            if (foundProductId) {
                const productRef = doc(db, 'products', foundProductId);
                const productSnap = await getDoc(productRef);
                if (productSnap.exists()) {
                    foundProductData = { id: productSnap.id, ...productSnap.data() };
                    setProductInfo(foundProductData);
                    const data = await getProductLedger(foundProductId, tempLotFilter, filters.startDate, filters.endDate, filters.partnerName);
                    setLedgerData(data);
                }
            }

            if (!foundProductData) {
                toast.error(`Không tìm thấy thông tin cho Mã hàng hoặc Số lô: "${term}"`);
            }
        } catch (error) {
            console.error("Lỗi khi lấy sổ chi tiết:", error);
            toast.error("Đã xảy ra lỗi khi tải dữ liệu.");
        } finally {
            setLoading(false);
        }
    }, []);

    const clear = () => {
        setProductInfo(null);
        setLedgerData(null);
        setLotNumberFilter(null);
    };

    return { productInfo, ledgerData, loading, lotNumberFilter, search, clear };
};