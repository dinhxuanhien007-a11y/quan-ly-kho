// src/components/SupplierAutocomplete.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, query, where } from 'firebase/firestore'; 
import { db } from '../firebaseConfig';
import styles from './Autocomplete.module.css';
import { FiChevronDown } from 'react-icons/fi';
import { normalizeString } from '../utils/stringUtils';

// Đổi tên component
const SupplierAutocomplete = ({ value, onSelect }) => {
    const [suggestions, setSuggestions] = useState([]);
    // Đổi tên state
    const [allSuppliers, setAllSuppliers] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const suggestionsRef = useRef(null);

    useEffect(() => {
        // Logic lấy dữ liệu nhà cung cấp
        const fetchSuppliers = async () => {
            try {
                setIsLoading(true);
                // SỬA LẠI: Truy vấn "supplier" thay vì "customer"
                const q = query(collection(db, 'partners'), where("partnerType", "==", "supplier"));
                const querySnapshot = await getDocs(q);
                const supplierList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAllSuppliers(supplierList);
                setError(null);
            } catch (err) {
                console.error("Lỗi khi tải danh sách nhà cung cấp:", err);
                setError("Không thể tải danh sách nhà cung cấp.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchSuppliers();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (suggestionsRef.current && activeIndex >= 0) {
            const activeItem = suggestionsRef.current.children[activeIndex];
            if (activeItem) {
                activeItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    const handleInputChange = (e) => {
        const inputValue = e.target.value;
        onSelect({ id: '', name: inputValue });
        setActiveIndex(-1);
        
        if (inputValue.length > 0) {
            const normalizedInput = normalizeString(inputValue);
            const filteredSuggestions = allSuppliers.filter(supplier =>
                normalizeString(supplier.partnerName).includes(normalizedInput)
            );
            setSuggestions(filteredSuggestions);
        } else {
            setSuggestions(allSuppliers.slice(0, 10)); 
        }
        setShowSuggestions(true);
    };

    const handleSuggestionClick = (supplier) => {
        onSelect({ id: supplier.id, name: supplier.partnerName });
        setShowSuggestions(false);
        setActiveIndex(-1);
    };

    const handleInputBlur = () => {
        setTimeout(() => {
            setShowSuggestions(false);
        }, 150); 
    };
    
    const handleKeyDown = useCallback((e) => {
    if (showSuggestions && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prevIndex => (prevIndex + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prevIndex => (prevIndex - 1 + suggestions.length) % suggestions.length);
        } 
        // THÊM MỚI LOGIC CHO PHÍM TAB
        else if (e.key === 'Tab' || e.key === 'Enter') {
            if (activeIndex >= 0) { // Chỉ hoạt động khi đã có một mục được highlight
                e.preventDefault(); // Ngăn hành vi mặc định của Tab (chuyển focus)
                handleSuggestionClick(suggestions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    }
}, [activeIndex, suggestions, showSuggestions, handleSuggestionClick]);


    const SuggestionsPortal = () => createPortal(
        <ul ref={suggestionsRef} className={styles.suggestionsList} style={{ width: `${inputRef.current?.offsetWidth}px` }}>
            {isLoading && <li className={styles.feedback}>Đang tải...</li>}
            {error && <li className={styles.feedback}>{error}</li>}
            {!isLoading && !error && suggestions.length === 0 && <li className={styles.feedback}>Không tìm thấy kết quả</li>}
            
            {!isLoading && !error && suggestions.map((supplier, index) => (
                <li 
                    key={supplier.id} 
                    className={index === activeIndex ? styles.activeSuggestion : ''}
                    onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(supplier); }}
                >
                    <strong>{supplier.partnerName}</strong> - <span>{supplier.id}</span>
                </li>
            ))}
        </ul>,
        containerRef.current
    );

    return (
        <div className={styles.autocompleteContainer} ref={containerRef}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                placeholder="Gõ để tìm nhà cung cấp..." // SỬA LẠI
                onFocus={handleInputChange}
            />
            <FiChevronDown className={styles.arrowIcon} />
            {showSuggestions && containerRef.current && <SuggestionsPortal />}
        </div>
    );
};

export default SupplierAutocomplete;