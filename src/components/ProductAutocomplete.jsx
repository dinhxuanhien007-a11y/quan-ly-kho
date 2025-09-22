// src/components/ProductAutocomplete.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, query, orderBy, documentId } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import styles from './Autocomplete.module.css';
import { FiChevronDown } from 'react-icons/fi';

const ProductAutocomplete = ({ value, onSelect, onChange, onBlur }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // MỚI: State để theo dõi mục đang được chọn bằng bàn phím
    const [activeIndex, setActiveIndex] = useState(-1);
    
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const suggestionsRef = useRef(null); // Ref cho danh sách ul

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

    // MỚI: Logic xử lý bàn phím
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
                    handleSuggestionClick(suggestions[activeIndex]);
                }
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        }
    }, [activeIndex, suggestions, showSuggestions]);

    useEffect(() => {
        if (suggestionsRef.current && activeIndex >= 0) {
            const activeItem = suggestionsRef.current.children[activeIndex];
            if (activeItem) {
                activeItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    const handleInputChange = (e) => {
        const inputValue = e.target.value.toUpperCase();
        onChange(inputValue);
        setActiveIndex(-1); // Reset active index khi gõ

        if (inputValue.length > 0) {
            const filteredSuggestions = allProducts.filter(product =>
                product.id.toUpperCase().includes(inputValue)
            );
            setSuggestions(filteredSuggestions);
        } else {
            setSuggestions(allProducts.slice(0, 10)); // Hiển thị một vài gợi ý khi trống
        }
        setShowSuggestions(true);
    };

    const handleSuggestionClick = (product) => {
        onSelect(product);
        setShowSuggestions(false);
        setActiveIndex(-1);
    };

    const handleInputBlur = () => {
        setTimeout(() => {
            setShowSuggestions(false);
            if (onBlur) onBlur();
        }, 150); // Delay để sự kiện click trên suggestion kịp xử lý
    };
    
    const SuggestionsPortal = () => createPortal(
    <ul
        ref={suggestionsRef}
        className={styles.suggestionsList}
        style={{
            // Chúng ta không cần định vị bằng top, left nữa
            // chỉ cần width để đảm bảo nó khớp với input
            width: `${inputRef.current.offsetWidth}px`,
        }}
    >
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
    // Đặt portal vào container Autocomplete
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
                onKeyDown={handleKeyDown} // <-- MỚI: Gắn sự kiện bàn phím
                placeholder="Nhập Mã hàng..."
                onFocus={handleInputChange}
            />
            <FiChevronDown className={styles.arrowIcon} />
            {showSuggestions && <SuggestionsPortal />}
        </div>
    );
};

export default ProductAutocomplete;