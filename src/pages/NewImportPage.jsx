// src/pages/NewImportPage.jsx
import React, { useState, useRef } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import AddNewProductAndLotModal from '../components/AddNewProductAndLotModal';
import AddNewLotModal from '../components/AddNewLotModal';
import { parseDateString, formatExpiryDate, formatDate } from '../utils/dateUtils';
import { FiInfo } from 'react-icons/fi';

const NewImportPage = () => {
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const [importDate, setImportDate] = useState(formattedDate);
    const [supplier, setSupplier] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState([
        { id: 1, productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '', manufacturer: '', productNotFound: false, lotStatus: 'unchecked', existingLotInfo: null }
    ]);
    const [isSaving, setIsSaving] = useState(false);
    const [newProductModal, setNewProductModal] = useState({ isOpen: false, productId: '', index: -1 });
    const [newLotModal, setNewLotModal] = useState({ isOpen: false, index: -1 });
    const inputRefs = useRef([]);

    const handleExpiryDateBlur = (index, value) => {
        const newItems = [...items];
        newItems[index].expiryDate = formatExpiryDate(value);
        setItems(newItems);
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        
        if (field === 'productId' || field === 'lotNumber') {
            newItems[index].lotStatus = 'unchecked';
            newItems[index].expiryDate = '';
            newItems[index].existingLotInfo = null;
        }
        
        setItems(newItems);
    };

    const checkExistingLot = async (index) => {
        const currentItem = items[index];
        if (!currentItem.productId || !currentItem.lotNumber) return;

        try {
            const q = query(
                collection(db, "inventory_lots"),
                where("productId", "==", currentItem.productId.trim()),
                where("lotNumber", "==", currentItem.lotNumber.trim())
            );
            const querySnapshot = await getDocs(q);
            
            const newItems = [...items];
            if (!querySnapshot.empty) {
                const existingLotData = querySnapshot.docs[0].data();
                newItems[index].lotStatus = 'exists';
                newItems[index].expiryDate = formatDate(existingLotData.expiryDate);
                newItems[index].existingLotInfo = {
                    quantityRemaining: existingLotData.quantityRemaining,
                    expiryDate: formatDate(existingLotData.expiryDate)
                };
            } else {
                newItems[index].lotStatus = 'new';
                newItems[index].existingLotInfo = null;
            }
            setItems(newItems);
        } catch (error) {
            console.error("Lỗi khi kiểm tra lô tồn tại: ", error);
        }
    };

    const handleNewLotDeclared = (index, declaredExpiryDate) => {
        const newItems = [...items];
        newItems[index].expiryDate = declaredExpiryDate;
        newItems[index].lotStatus = 'declared';
        setItems(newItems);
        setNewLotModal({ isOpen: false, index: -1 });
    };

    const handleProductSearch = async (index, productId) => {
        if (!productId) return;
        const newItems = [...items];
        try {
            const productRef = doc(db, 'products', productId);
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
                const productData = productSnap.data();
                newItems[index] = {
                    ...newItems[index],
                    productName: productData.productName || '',
                    unit: productData.unit || '',
                    packaging: productData.packaging || '',
                    storageTemp: productData.storageTemp || '',
                    team: productData.team || '',
                    manufacturer: productData.manufacturer || '',
                    productNotFound: false,
                };
            } else {
                newItems[index].productName = '';
                newItems[index].productNotFound = true;
            }
        } catch (error) {
            console.error("Lỗi khi tìm kiếm sản phẩm:", error);
            newItems[index].productName = 'Lỗi khi tìm kiếm!';
            newItems[index].productNotFound = false;
        } finally {
            setItems(newItems);
        }
    };
    
    const handleNewProductCreated = (newData) => {
        const newItems = [...items];
        const { index } = newProductModal;
        newItems[index] = {
            ...newItems[index], 
            ...newData,
            productNotFound: false,
        };
        setItems(newItems);
        setNewProductModal({ isOpen: false, productId: '', index: -1 });
        setTimeout(() => {
            inputRefs.current[index * 3 + 2]?.focus();
        }, 100);
    };

    const handleKeyDown = (e, rowIndex, inputIndex) => {
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            const nextInputIndex = (rowIndex * 3) + inputIndex + 1;
            const nextInput = inputRefs.current[nextInputIndex];
            if (nextInput) {
                nextInput.focus();
            }
        }
    };

    const addNewRow = () => {
        setItems([
            ...items,
            { id: Date.now(), productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '', manufacturer: '', productNotFound: false, lotStatus: 'unchecked', existingLotInfo: null }
        ]);
    };

    const handleSaveSlip = async () => {
        if (!supplier) {
            alert('Vui lòng nhập thông tin Nhà cung cấp.');
            return;
        }
        const validItems = items.filter(item => item.productId && item.quantity > 0);
        if (validItems.length === 0) {
            alert('Vui lòng thêm ít nhất một mặt hàng hợp lệ vào phiếu.');
            return;
        }
        setIsSaving(true);
        try {
            const slipData = {
                importDate: formattedDate,
                supplier,
                description,
                items: validItems,
                status: 'pending',
                createdAt: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, 'import_tickets'), slipData);
            alert(`Lưu tạm phiếu nhập thành công! ID phiếu: ${docRef.id}`);
            setSupplier('');
            setDescription('');
            setItems([{ id: 1, productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '', manufacturer: '', productNotFound: false, lotStatus: 'unchecked', existingLotInfo: null }]);
        } catch (error) {
            console.error("Lỗi khi lưu phiếu nhập: ", error);
            alert('Đã xảy ra lỗi khi lưu phiếu.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDirectImport = async () => {
        if (!supplier) {
            alert('Vui lòng nhập thông tin Nhà cung cấp.');
            return;
        }
        const validItems = items.filter(item => item.productId && item.quantity > 0);
        if (validItems.length === 0) {
            alert('Vui lòng thêm ít nhất một mặt hàng hợp lệ.');
            return;
        }
        if (!window.confirm('Bạn có chắc muốn nhập kho trực tiếp? Thao tác này sẽ cập nhật tồn kho ngay lập tức.')) {
            return;
        }
        setIsSaving(true);
        try {
            for (const item of validItems) {
                const expiryDateObject = parseDateString(item.expiryDate);
                if (!expiryDateObject) {
                    alert(`HSD của mặt hàng ${item.productName} (${item.lotNumber}) có định dạng sai.`);
                    setIsSaving(false);
                    return;
                }
                const expiryTimestamp = Timestamp.fromDate(expiryDateObject);
                const newLotData = {
                    importDate: Timestamp.now(),
                    productId: item.productId,
                    productName: item.productName,
                    lotNumber: item.lotNumber,
                    expiryDate: expiryTimestamp,
                    unit: item.unit,
                    packaging: item.packaging,
                    storageTemp: item.storageTemp,
                    team: item.team,
                    manufacturer: item.manufacturer,
                    quantityImported: Number(item.quantity),
                    quantityRemaining: Number(item.quantity),
                    notes: item.notes,
                    supplier: supplier,
                };
                await addDoc(collection(db, "inventory_lots"), newLotData);
            }

            const slipData = {
                importDate: formattedDate,
                supplier,
                description,
                items: validItems,
                status: 'completed',
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, 'import_tickets'), slipData);

            alert('Nhập kho trực tiếp thành công!');
            setSupplier('');
            setDescription('');
            setItems([{ id: 1, productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '', manufacturer: '', productNotFound: false, lotStatus: 'unchecked', existingLotInfo: null }]);
        } catch (error) {
            console.error("Lỗi khi nhập kho trực tiếp: ", error);
            alert('Đã xảy ra lỗi khi nhập kho trực tiếp.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div>
            {newProductModal.isOpen && (
                <AddNewProductAndLotModal
                    productId={newProductModal.productId}
                    onClose={() => setNewProductModal({ isOpen: false, productId: '', index: -1 })}
                    onSave={handleNewProductCreated}
                />
            )}
            {newLotModal.isOpen && (
                <AddNewLotModal
                    productId={items[newLotModal.index].productId}
                    productName={items[newLotModal.index].productName}
                    lotNumber={items[newLotModal.index].lotNumber}
                    onClose={() => setNewLotModal({ isOpen: false, index: -1 })}
                    onSave={(expiry) => handleNewLotDeclared(newLotModal.index, expiry)}
                />
            )}

            <h1>Tạo Phiếu Nhập Kho</h1>
            <div className="form-section">
                <div className="form-row">
                    <div className="form-group">
                        <label>Ngày nhập</label>
                        <input type="text" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Nhà cung cấp</label>
                        <input type="text" placeholder="Nhập mã hoặc tên NCC" value={supplier} onChange={e => setSupplier(e.target.value)} />
                    </div>
                </div>
                <div className="form-group">
                    <label>Diễn giải</label>
                    <textarea rows="2" placeholder="Ghi chú cho phiếu nhập..." value={description} onChange={e => setDescription(e.target.value)}></textarea>
                </div>
            </div>

            <h2>Chi tiết hàng hóa</h2>
            <div className="item-details-grid">
                <div className="grid-header">Mã hàng</div>
                <div className="grid-header">Tên hàng</div>
                <div className="grid-header">Số lô</div>
                <div className="grid-header">HSD</div>
                <div className="grid-header">ĐVT</div>
                <div className="grid-header">Quy cách</div>
                <div className="grid-header">Số lượng</div>
                <div className="grid-header">Ghi chú</div>
                <div className="grid-header">Nhiệt độ BQ</div>
                <div className="grid-header">Team</div>

                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        <div className="grid-cell" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                            <input
                                ref={el => inputRefs.current[index * 3] = el}
                                onKeyDown={(e) => handleKeyDown(e, index, 0)}
                                type="text"
                                value={item.productId}
                                onChange={e => handleItemChange(index, 'productId', e.target.value.toUpperCase())}
                                onBlur={e => handleProductSearch(index, e.target.value)}
                            />
                            {item.productNotFound && (
                                <button
                                    onClick={() => setNewProductModal({ isOpen: true, productId: item.productId, index: index })}
                                    className="btn-link"
                                    style={{ marginTop: '5px', color: '#007bff', cursor: 'pointer', background: 'none', border: 'none', padding: '0', textAlign: 'left', fontSize: '13px' }}
                                >
                                    Mã này không tồn tại. Tạo mới...
                                </button>
                            )}
                        </div>
                        <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
                        <div className="grid-cell" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                            <input
                                ref={el => inputRefs.current[index * 3 + 1] = el}
                                onKeyDown={(e) => handleKeyDown(e, index, 1)}
                                type="text"
                                value={item.lotNumber}
                                onChange={e => handleItemChange(index, 'lotNumber', e.target.value)}
                                onBlur={() => checkExistingLot(index)}
                            />
                            {item.lotStatus === 'exists' && item.existingLotInfo && (
                                <div className="existing-lot-info">
                                    <FiInfo />
                                    <span>Lô đã có | Tồn: {item.existingLotInfo.quantityRemaining} | HSD: {item.existingLotInfo.expiryDate}</span>
                                </div>
                            )}
                            {item.lotStatus === 'new' && (
                                <button onClick={() => setNewLotModal({ isOpen: true, index: index })} className="btn-link" style={{marginTop: '5px'}}>
                                    [+] Khai báo lô mới...
                                </button>
                            )}
                        </div>
                        <div className="grid-cell">
                            <input 
                                type="text" 
                                placeholder="dd/mm/yyyy" 
                                value={item.expiryDate} 
                                onChange={e => handleItemChange(index, 'expiryDate', e.target.value)} 
                                onBlur={e => handleExpiryDateBlur(index, e.target.value)}
                                readOnly={item.lotStatus === 'exists'}
                                style={{backgroundColor: item.lotStatus === 'exists' ? '#f0f0f0' : '#fff', cursor: item.lotStatus === 'exists' ? 'not-allowed' : 'text'}}
                            />
                        </div>
                        <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
                        <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
                        <div className="grid-cell">
                            <input
                                ref={el => inputRefs.current[index * 3 + 2] = el}
                                type="number"
                                value={item.quantity}
                                onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                            />
                        </div>
                        <div className="grid-cell"><textarea value={item.notes} onChange={e => handleItemChange(index, 'notes', e.target.value)} /></div>
                        <div className="grid-cell"><textarea value={item.storageTemp} readOnly /></div>
                        <div className="grid-cell"><input type="text" value={item.team} readOnly /></div>
                    </React.Fragment>
                ))}
            </div>
            
            <button onClick={addNewRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
            <div className="page-actions">
                <button onClick={handleSaveSlip} className="btn-secondary" disabled={isSaving}>
                    {isSaving ? 'Đang lưu...' : 'Lưu Tạm'}
                </button>
                <button onClick={handleDirectImport} className="btn-primary" disabled={isSaving}>
                    {isSaving ? 'Đang xử lý...' : 'Nhập Kho Trực Tiếp'}
                </button>
            </div>
        </div>
    );
};

export default NewImportPage;