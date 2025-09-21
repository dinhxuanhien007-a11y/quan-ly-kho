// src/pages/DataImportPage.jsx

import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { collection, writeBatch, doc, Timestamp, getDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';
import Papa from 'papaparse';
import { FiUpload, FiDownload, FiInfo } from 'react-icons/fi';
import { parseDateString } from '../utils/dateUtils';
import styles from '../styles/DataImportPage.module.css';
import { normalizeString, generateKeywords } from '../utils/stringUtils';

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

    // src/pages/DataImportPage.jsx

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
        const MAX_BATCH_SIZE = 490; // Ngưỡng an toàn cho mỗi batch
        let batch = writeBatch(db);
        let operationCount = 0;
        let totalSuccess = 0;

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowIndex = i + 2; // Số thứ tự dòng trong file CSV

            if (importType === 'inventory') {
                // Chỉ yêu cầu Mã hàng và Tên hàng là bắt buộc
                if (!row.productId || !String(row.productId).trim() || !row.productName || !String(row.productName).trim()) {
                    logMessage(`Bỏ qua dòng ${rowIndex}: Thiếu thông tin bắt buộc (productId hoặc productName).`, 'warn');
                    continue;
                }
                
                const productId = String(row.productId).trim().toUpperCase();
                const productRef = doc(db, 'products', productId);
                
                // 1. Luôn tạo hoặc cập nhật thông tin sản phẩm (master data)
                const productData = {
                    productName: String(row.productName).trim(),
                    unit: String(row.unit || '').trim(),
                    packaging: String(row.packaging || '').trim(),
                    storageTemp: String(row.storageTemp || '').trim(),
                    manufacturer: String(row.manufacturer || '').trim(),
                    team: String(row.team || 'MED').trim(),
                    createdAt: serverTimestamp()
                };
                batch.set(productRef, productData, { merge: true });
                operationCount++;
                logMessage(`Đã xử lý thông tin sản phẩm: ${productId}`);

                // 2. Chỉ tạo bản ghi tồn kho nếu có Số lượng (quantityRemaining)
                const quantityStr = String(row.quantityRemaining || '').replace(/[.,]/g, ''); // Chấp nhận số có dấu . hoặc ,

                if (quantityStr && !isNaN(Number(quantityStr)) && Number(quantityStr) > 0) {
                    const quantityNum = Number(quantityStr);

                    // Xử lý Số lô: nếu trống thì mặc định là 'N/A'
                    let lotNumber = String(row.lotNumber || '').trim();
                    if (!lotNumber) {
                        lotNumber = 'N/A';
                    }

                    // Xử lý HSD: nếu trống thì là null, nếu sai định dạng thì báo lỗi
                    const expiryDate = parseDateString(row.expiryDate);
                    if (!expiryDate && row.expiryDate && String(row.expiryDate).trim()) {
                        logMessage(`Bỏ qua lô hàng của dòng ${rowIndex} (Mã: ${productId}): Sai định dạng "expiryDate" (HSD).`, 'warn');
                        // Không `continue` để vẫn lưu được thông tin sản phẩm
                    } else {
                        const inventoryRef = doc(collection(db, 'inventory_lots'));
                        const inventoryData = {
                            productId: productId,
                            productName: productData.productName,
                            lotNumber: lotNumber,
                            expiryDate: expiryDate ? Timestamp.fromDate(expiryDate) : null,
                            importDate: Timestamp.now(),
                            quantityImported: quantityNum,
                            quantityRemaining: quantityNum,
                            unit: productData.unit,
                            packaging: productData.packaging,
                            storageTemp: productData.storageTemp,
                            team: productData.team,
                            manufacturer: productData.manufacturer,
                            supplier: 'Tồn đầu kỳ',
                            notes: String(row.notes || '').trim()
                        };
                        batch.set(inventoryRef, inventoryData);
                        operationCount++;
                        logMessage(` -> Đã tạo lô hàng tồn kho cho ${productId} với SL: ${quantityNum}`);
                    }
                } else {
                    logMessage(` -> Chỉ khai báo thông tin, không tạo lô tồn kho.`);
                }
                
                totalSuccess++;
            
            } else if (importType === 'partners') {
                if (!row.partnerId || !row.partnerName) {
                    logMessage(`Bỏ qua dòng ${rowIndex}: Thiếu partnerId hoặc partnerName.`, 'warn');
                    continue;
                }
                const docId = String(row.partnerId).trim().toUpperCase();
                const partnerName = String(row.partnerName).trim();
                const creationDate = parseDateString(row.creationDate);
                const creationTimestamp = creationDate ? Timestamp.fromDate(creationDate) : Timestamp.now();
        
                const docData = {
                    partnerName: partnerName,
                    partnerType: String(row.partnerType).trim().toLowerCase() === 'customer' ? 'customer' : 'supplier',
                    createdAt: creationTimestamp,
                    partnerNameNormalized: normalizeString(partnerName),
                    searchKeywords: generateKeywords(partnerName)
                };
                const docRef = doc(collection(db, 'partners'), docId);
                batch.set(docRef, docData, { merge: true });
                operationCount++;
                totalSuccess++;
            }

            // Ghi batch xuống database khi đầy hoặc xử lý xong
            if (operationCount >= MAX_BATCH_SIZE || i === data.length - 1) {
                await batch.commit();
                logMessage(`Đã ghi thành công một lô ${operationCount} thao tác...`);
                batch = writeBatch(db);
                operationCount = 0;
            }
        }

        toast.success(`Hoàn tất! Xử lý thành công ${totalSuccess}/${data.length} mục.`);
        logMessage(`Hoàn tất! Xử lý thành công ${totalSuccess}/${data.length} mục.`, 'success');

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
            // --- THÊM CỘT 'notes' VÀO ĐÂY ---
            headers = "productId*,productName*,lotNumber*,quantityRemaining*,expiryDate,unit,packaging,storageTemp,team,manufacturer,notes,creationDate";
            filename = "mau_import_san_pham_ton_kho.csv";
            // --- THÊM DỮ LIỆU MẪU CHO CỘT 'notes' ---
            sampleData = "SP001,BÔNG CỒN ALKOCIDE,L202501,100,31/12/2025,Hộp,100 miếng/hộp,Nhiệt độ phòng,MED,DentaLife,Hàng ưu tiên,01/01/2025\nSP002,GĂNG TAY Y TẾ,GT001,50,,Hộp,50 đôi/hộp,,MED,,Hàng dễ vỡ,"
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