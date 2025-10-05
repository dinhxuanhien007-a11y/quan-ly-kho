// src/components/PartnerAutocomplete.jsx
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore'; // Giữ lại collection và getDocs
import { normalizeString } from '../utils/stringUtils'; // Import hàm chuẩn hóa chuỗi

const PartnerAutocomplete = ({ value, onSelect }) => {
    const [partners, setPartners] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef(null);

    // Lấy dữ liệu khách hàng và nhà cung cấp một lần duy nhất khi component được tải
    useEffect(() => {
        const fetchPartners = async () => {
            try {
                // THAY THẾ: Chỉ truy vấn collection 'partners' duy nhất
                const q = collection(db, 'partners');

                // Chỉ cần một lần getDocs vì bạn đã gộp 2 collection
                const querySnapshot = await getDocs(q);

                const partnerList = querySnapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    name: doc.data().partnerName,
                    type: doc.data().partnerType
                }));
                
                setPartners(partnerList.sort((a, b) => a.name.localeCompare(b.name))); // Sắp xếp theo ABC
            } catch (error) {
                console.error("Lỗi khi tải danh sách đối tác:", error);
                // Bạn có thể thêm toast.error ở đây để hiển thị lỗi quyền:
                // toast.error("Lỗi khi tải danh sách đối tác. Vui lòng kiểm tra quyền đọc.");
            }
        };

        fetchPartners();
    }, []);

    // Xử lý việc ẩn danh sách gợi ý khi click ra bên ngoài
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        const inputValue = e.target.value;
        onSelect(inputValue); // Cập nhật state ở component cha ngay khi gõ

        if (inputValue) {
            const normalizedInput = normalizeString(inputValue);
            const filteredSuggestions = partners.filter(partner =>
                // Kiểm tra cả tên đã chuẩn hóa và ID (partnerId)
                normalizeString(partner.name).includes(normalizedInput) ||
                partner.id.toLowerCase().includes(inputValue.toLowerCase())
            );
            setSuggestions(filteredSuggestions);
            setShowSuggestions(true);
        } else {
            // Hiển thị 10 gợi ý đầu tiên nếu ô trống
            setSuggestions(partners.slice(0, 10)); 
            setShowSuggestions(true);
        }
    };

    const handleSuggestionClick = (partnerName) => {
        onSelect(partnerName); // Gửi tên đối tác đã chọn về component cha
        setSuggestions([]);
        setShowSuggestions(false);
    };

    return (
        <div className="autocomplete-wrapper" ref={wrapperRef}>
            <input
                type="text"
                value={value}
                onChange={handleInputChange}
                // Thêm onFocus để hiển thị gợi ý khi click vào ô
                onFocus={() => partners.length > 0 && setShowSuggestions(true)}
                placeholder="Nhập tên NCC / Khách hàng..."
            />
            {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestions-list">
                    {suggestions.map((partner) => (
                        <li key={partner.id} onClick={() => handleSuggestionClick(partner.name)}>
                            {/* THAY ĐỔI: Hiển thị tên, ID, và loại đối tác */}
                            <strong>{partner.name}</strong> 
                            <span>({partner.type === 'supplier' ? 'NCC' : 'KH'})</span>
                            <span style={{marginLeft: '10px'}}>{partner.id}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default PartnerAutocomplete;