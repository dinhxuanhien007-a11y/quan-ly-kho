// src/components/ProductAutocomplete.jsx

// --- BẮT ĐẦU THAY ĐỔI 1: Import thêm forwardRef, useImperativeHandle ---
import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, query, orderBy, documentId } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import styles from './Autocomplete.module.css';
import { FiChevronDown } from 'react-icons/fi';

// --- BẮT ĐẦU THAY ĐỔI 2: Bọc component bằng forwardRef ---
const ProductAutocomplete = forwardRef(({ value, onSelect, onBlur, onChange, onEnterPress }, ref) => {
    const [inputValue, setInputValue] = useState(value);
    const [suggestions, setSuggestions] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const suggestionsRef = useRef(null);

    // --- BẮT ĐẦU THAY ĐỔI 3: Expose hàm focus cho component cha ---
    useImperativeHandle(ref, () => ({
        focus: () => {
            inputRef.current.focus();
        }
    }));
    // --- KẾT THÚC THAY ĐỔI 3 ---

    useEffect(() => {
        setInputValue(value);
    }, [value]);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setIsLoading(true);
                const productsQuery = query(collection(db, 'products'), orderBy(documentId()));
                const querySnapshot = await getDocs(productsQuery);
                const productList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAllProducts(productList);
                setError(null);
            } catch (err) {
                console.error("Lỗi khi tải danh sách sản phẩm:", err);
                setError("Không thể tải danh sách sản phẩm.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchProducts();
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

    const handleSuggestionClick = useCallback((product) => {
        setInputValue(product.id);
        if (onSelect) {
            onSelect(product);
        }
        setShowSuggestions(false);
        setActiveIndex(-1);
    }, [onSelect]);

    const handleInputChange = useCallback((e) => {
        const newInputValue = e.target.value.toUpperCase();
        setInputValue(newInputValue);
        
        if (onChange) {
            onChange(newInputValue);
        }

        setActiveIndex(-1);
        if (newInputValue.length > 0) {
            const filteredSuggestions = allProducts.filter(p =>
                p.id.toUpperCase().includes(newInputValue)
            );
            setSuggestions(filteredSuggestions);
        } else {
            setSuggestions(allProducts.slice(0, 10));
        }
        setShowSuggestions(true);
    }, [allProducts, onChange]);

    const handleInputBlur = useCallback(() => {
        setTimeout(() => {
            setShowSuggestions(false);
            if (onBlur) {
                onBlur();
            }
        }, 150);
    }, [onBlur]);
    
    const handleKeyDown = useCallback((e) => {
        if (showSuggestions && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(prevIndex => (prevIndex + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(prevIndex => (prevIndex - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIndex >= 0) {
        // Nếu đang chọn một gợi ý, thì hoàn tất việc chọn
        handleSuggestionClick(suggestions[activeIndex]);
    } else {
        // Ngược lại, nếu không có gợi ý nào được chọn...
        if (onEnterPress) {
            // Ưu tiên chạy hàm onEnterPress nếu có (dành cho trang Báo cáo)
            onEnterPress();
        } else if (onBlur) {
            // Nếu không, quay về hành vi cũ là kích hoạt onBlur (dành cho trang Nhập/Xuất)
            onBlur();
        }
        setShowSuggestions(false); // Luôn ẩn danh sách gợi ý sau khi nhấn Enter
    }
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        }
    }, [activeIndex, suggestions, showSuggestions, onBlur, handleSuggestionClick]);
    
    const SuggestionsPortal = () => createPortal(
        <ul ref={suggestionsRef} className={styles.suggestionsList} style={{ width: `${inputRef.current?.offsetWidth}px` }}>
            {isLoading && <li className={styles.feedback}>Đang tải...</li>}
            {error && <li className={styles.feedback}>{error}</li>}
            {!isLoading && !error && suggestions.length === 0 && <li className={styles.feedback}>Không tìm thấy kết quả</li>}
            
            {!isLoading && !error && suggestions.map((product, index) => (
                <li 
                    key={product.id} 
                    className={index === activeIndex ? styles.activeSuggestion : ''}
                    onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(product); }}
                >
                    <strong>{product.id}</strong> - <span>{product.productName}</span>
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
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                placeholder="Nhập Mã hàng..."
                onFocus={handleInputChange}
            />
            <FiChevronDown className={styles.arrowIcon} />
            
            {showSuggestions && containerRef.current && <SuggestionsPortal />}
        </div>
    );
}); // --- KẾT THÚC THAY ĐỔI 2 ---

export default ProductAutocomplete;
