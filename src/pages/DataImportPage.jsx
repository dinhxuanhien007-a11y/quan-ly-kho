// src/pages/DataImportPage.jsx

import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { collection, writeBatch, doc, Timestamp, getDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import Papa from 'papaparse';
import { FiUpload, FiDownload, FiInfo } from 'react-icons/fi';
import { parseDateString } from '../utils/dateUtils';
import styles from '../styles/DataImportPage.module.css';

const DataImportPage = () => {
    const [importType, setImportType] = useState('inventory');
    const [pastedData, setPastedData] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importLog, setImportLog] = useState([]);

    const logMessage = (message, type = 'info') => {
        setImportLog(prev => [...prev, { message, type, time: new Date().toLocaleTimeString() }]);
    };

    const handleFileImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        logMessage(`Bắt đầu đọc file: ${file.name}`);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => { processData(results.data); },
            error: (err) => {
                toast.error("Không thể đọc file CSV.");
                logMessage(`Lỗi đọc file: ${err.message}`, 'error');
            }
        });
        e.target.value = null;
    };
    
    const handlePasteImport = () => {
        if (!pastedData.trim()) {
            return toast.warn("Vui lòng dán dữ liệu vào ô trống.");
        }
        logMessage(`Bắt đầu đọc dữ liệu đã dán.`);
        Papa.parse(pastedData, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => { processData(results.data); },
             error: (err) => {
                toast.error("Định dạng dữ liệu đã dán không hợp lệ.");
                logMessage(`Lỗi đọc dữ liệu: ${err.message}`, 'error');
            }
        });
    };

    const processData = async (data) => {
        if (!data || data.length === 0) {
            toast.warn("Không có dữ liệu hợp lệ để import.");
            logMessage("Không tìm thấy dòng dữ liệu nào.", 'warn');
            return;
        }

        setIsImporting(true);
        setImportLog([]);
        logMessage(`Phát hiện ${data.length} dòng. Bắt đầu xử lý cho loại: ${importType}...`);
        
        try {
            const MAX_BATCH_SIZE = 499;
            let batch = writeBatch(db);
            let operationCount = 0;
            let totalSuccess = 0;

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                // Xử lý ngày tạo một cách tập trung
                const creationDate = parseDateString(row.creationDate);
                const creationTimestamp = creationDate ? Timestamp.fromDate(creationDate) : Timestamp.now();

                if (importType === 'inventory') {
                    if (!row.productId || !row.productName || !row.lotNumber || !row.quantityRemaining) {
                        logMessage(`Bỏ qua dòng ${i + 2}: Thiếu thông tin bắt buộc (Mã, Tên, Lô, SL Tồn).`, 'warn');
                        continue;
                    }
                    
                    const expiryDate = parseDateString(row.expiryDate);
                    if (!expiryDate && row.expiryDate) {
                        logMessage(`Bỏ qua dòng ${i + 2}: Sai định dạng HSD (cần là dd/mm/yyyy).`, 'warn');
                        continue;
                    }

                    const productId = row.productId.trim().toUpperCase();
                    const productRef = doc(db, 'products', productId);
                    const productSnap = await getDoc(productRef);

                    if (!productSnap.exists()) {
                        const newProductData = {
                            productName: row.productName,
                            unit: row.unit || '',
                            packaging: row.packaging || '',
                            storageTemp: row.storageTemp || '',
                            manufacturer: row.manufacturer || '',
                            team: row.team || 'MED',
                            createdAt: creationTimestamp // Thêm createdAt cho sản phẩm mới
                        };
                        batch.set(productRef, newProductData);
                        operationCount++;
                        logMessage(`Đã tạo sản phẩm mới: ${productId}`);
                    }
                    
                    const inventoryRef = doc(collection(db, 'inventory_lots'));
                    const inventoryData = {
                        productId: productId,
                        productName: row.productName,
                        lotNumber: row.lotNumber.trim(),
                        expiryDate: expiryDate ? Timestamp.fromDate(expiryDate) : null,
                        importDate: Timestamp.now(),
                        quantityImported: Number(row.quantityRemaining),
                        quantityRemaining: Number(row.quantityRemaining),
                        unit: row.unit || '',
                        packaging: row.packaging || '',
                        storageTemp: row.storageTemp || '',
                        team: row.team || 'MED',
                        manufacturer: row.manufacturer || '',
                        supplier: 'Tồn đầu kỳ',
                    };
                    batch.set(inventoryRef, inventoryData);
                    operationCount++;
                    totalSuccess++;
                
                } else if (importType === 'partners') {
                    if (!row.partnerId) {
                        logMessage(`Bỏ qua dòng ${i + 2}: Thiếu partnerId.`, 'warn');
                        continue;
                    }
                    const docId = row.partnerId.trim().toUpperCase();
                    const docData = {
                        partnerName: row.partnerName || '',
                        partnerType: row.partnerType === 'customer' ? 'customer' : 'supplier',
                        createdAt: creationTimestamp // Thêm createdAt cho đối tác mới
                    };
                    const docRef = doc(collection(db, 'partners'), docId);
                    batch.set(docRef, docData);
                    operationCount++;
                    totalSuccess++;
                }

                if (operationCount >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    logMessage(`Đã ghi thành công ${operationCount} thao tác...`);
                    batch = writeBatch(db);
                    operationCount = 0;
                }
            }

            if (operationCount > 0) {
                await batch.commit();
                logMessage(`Đã ghi thành công ${operationCount} thao tác cuối cùng.`);
            }

            toast.success(`Hoàn tất! Import thành công ${totalSuccess}/${data.length} mục.`);
            logMessage(`Hoàn tất! Import thành công ${totalSuccess}/${data.length} mục.`, 'success');

        } catch (error) {
            console.error("Lỗi khi import dữ liệu: ", error);
            toast.error("Đã xảy ra lỗi trong quá trình import.");
            logMessage(`Lỗi nghiêm trọng: ${error.message}`, 'error');
        } finally {
            setIsImporting(false);
            setPastedData('');
        }
    };
    
    const downloadTemplate = () => {
        let headers, filename, sampleData;
        if (importType === 'partners') {
            headers = "partnerId*,partnerName*,partnerType,creationDate";
            filename = "mau_import_doi_tac.csv";
            sampleData = "NCC-01,CÔNG TY DƯỢC PHẨM ABC,supplier,25/12/2024\nKH-01,BỆNH VIỆN XYZ,customer,";
        } else {
            headers = "productId*,productName*,lotNumber*,quantityRemaining*,expiryDate,unit,packaging,storageTemp,team,manufacturer,creationDate";
            filename = "mau_import_san_pham_ton_kho.csv";
            sampleData = "SP001,BÔNG CỒN ALKOCIDE,L202501,100,31/12/2025,Hộp,100 miếng/hộp,Nhiệt độ phòng,MED,DentaLife,01/01/2025\nSP002,GĂNG TAY Y TẾ,GT001,50,,Hộp,50 đôi/hộp,,MED,,"
        }
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers + "\n" + sampleData;
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className={styles.dataImportPage}>
            <div className="page-header">
                <h1>Import Dữ Liệu Hàng Loạt</h1>
            </div>

            <div className={styles.importContainer}>
                <div className={styles.importControls}>
                    <h3>1. Chọn loại dữ liệu</h3>
                    <div className={styles.importTypeSelector}>
                        <button onClick={() => setImportType('inventory')} className={importType === 'inventory' ? styles.active : ''}>Sản phẩm & Tồn kho</button>
                        <button onClick={() => setImportType('partners')} className={importType === 'partners' ? styles.active : ''}>Đối tác</button>
                    </div>

                    <h3>2. Chuẩn bị dữ liệu</h3>
                    <p>Dữ liệu cần ở định dạng CSV (UTF-8). Bạn có thể dùng file mẫu dưới đây để đảm bảo đúng cấu trúc cột.</p>
                    <button onClick={downloadTemplate} className="btn-secondary" style={{ width: '100%' }}>
                        <FiDownload /> Tải File Mẫu
                    </button>
                    
                    <div className={styles.importInstructions}>
                         <FiInfo /> 
                         <div>
                            <strong>Lưu ý quan trọng:</strong>
                            <ul>
                                <li>Cột tiêu đề (có dấu `*`) là bắt buộc phải có dữ liệu.</li>
                                <li>Nếu `productId` chưa có, một sản phẩm mới sẽ được tự động tạo.</li>
                                <li>Mỗi dòng trong file sẽ tạo ra một lô hàng tồn kho mới.</li>
                                <li>Nếu `partnerId` đã tồn tại, dữ liệu cũ sẽ bị **ghi đè**.</li>
                                <li>Cột `creationDate` (định dạng dd/mm/yyyy) nếu bỏ trống sẽ tự lấy ngày hiện tại.</li>
                            </ul>
                         </div>
                    </div>
                </div>

                <div className={styles.importActions}>
                    <h3>3. Tải lên và thực hiện</h3>
                     <div className={styles.importMethod}>
                        <h4>Cách 1: Tải lên file .csv</h4>
                        <input type="file" accept=".csv" onChange={handleFileImport} disabled={isImporting} />
                    </div>
                     <div className={styles.importMethod}>
                        <h4>Cách 2: Dán dữ liệu từ Excel/Google Sheets</h4>
                        <textarea 
                            rows="8" 
                            placeholder="Dán dữ liệu của bạn vào đây (bao gồm cả dòng tiêu đề)"
                            value={pastedData}
                            onChange={(e) => setPastedData(e.target.value)}
                            disabled={isImporting}
                        ></textarea>
                        <button onClick={handlePasteImport} className="btn-primary" disabled={isImporting} style={{marginTop: '10px'}}>
                            <FiUpload /> {isImporting ? 'Đang import...' : 'Import từ dữ liệu đã dán'}
                        </button>
                    </div>
                    <div className={styles.importLogContainer}>
                        <h4>Nhật ký Import</h4>
                        <div className={styles.importLog}>
                            {importLog.length === 0 && <p>Chưa có hoạt động nào.</p>}
                            {importLog.map((log, index) => (
                                <p key={index} className={`${styles.logItem} ${styles[`log-${log.type}`]}`}>
                                    <span>[{log.time}]</span> {log.message}
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataImportPage;