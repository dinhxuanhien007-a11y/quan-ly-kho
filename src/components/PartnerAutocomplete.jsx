// src/components/PartnerAutocomplete.jsx
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';
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
                const customersQuery = collection(db, 'customers');
                const suppliersQuery = collection(db, 'suppliers');

                const [customersSnapshot, suppliersSnapshot] = await Promise.all([
                    getDocs(customersQuery),
                    getDocs(suppliersQuery)
                ]);

                const customerList = customersSnapshot.docs.map(doc => ({ id: `cust-${doc.id}`, name: doc.data().name }));
                const supplierList = suppliersSnapshot.docs.map(doc => ({ id: `supp-${doc.id}`, name: doc.data().name }));

                // Gộp hai danh sách và loại bỏ các đối tác trùng tên
                const combinedList = [...customerList, ...supplierList];
                const uniquePartners = Array.from(new Map(combinedList.map(item => [item.name.toLowerCase(), item])).values());
                
                setPartners(uniquePartners.sort((a, b) => a.name.localeCompare(b.name))); // Sắp xếp theo ABC
            } catch (error) {
                console.error("Lỗi khi tải danh sách đối tác:", error);
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
                normalizeString(partner.name).includes(normalizedInput)
            );
            setSuggestions(filteredSuggestions);
            setShowSuggestions(true);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
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
                onFocus={() => value && suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Nhập tên NCC / Khách hàng..."
            />
            {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestions-list">
                    {suggestions.map((partner) => (
                        <li key={partner.id} onClick={() => handleSuggestionClick(partner.name)}>
                            {partner.name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default PartnerAutocomplete;