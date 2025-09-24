// src/components/CustomerAutocomplete.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, query, where } from 'firebase/firestore'; 
import { db } from '../firebaseConfig';
import styles from './Autocomplete.module.css';
import { FiChevronDown } from 'react-icons/fi';
import { normalizeString } from '../utils/stringUtils';

const CustomerAutocomplete = ({ value, onSelect }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [allCustomers, setAllCustomers] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const suggestionsRef = useRef(null);

    useEffect(() => {
        const fetchCustomers = async () => {
            try {
                setIsLoading(true);
                const q = query(collection(db, 'partners'), where("partnerType", "==", "customer"));
                const querySnapshot = await getDocs(q);
                const customerList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAllCustomers(customerList);
                setError(null);
            } catch (err) {
                console.error("Lỗi khi tải danh sách khách hàng:", err);
                setError("Không thể tải danh sách khách hàng.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchCustomers();
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
            const filteredSuggestions = allCustomers.filter(customer =>
                normalizeString(customer.partnerName).includes(normalizedInput)
            );
            setSuggestions(filteredSuggestions);
        } else {
            setSuggestions(allCustomers.slice(0, 10)); 
        }
        setShowSuggestions(true);
    };

    const handleSuggestionClick = (customer) => {
        onSelect({ id: customer.id, name: customer.partnerName });
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

    const SuggestionsPortal = () => createPortal(
        <ul ref={suggestionsRef} className={styles.suggestionsList} style={{ width: `${inputRef.current?.offsetWidth}px` }}>
            {isLoading && <li className={styles.feedback}>Đang tải...</li>}
            {error && <li className={styles.feedback}>{error}</li>}
            {!isLoading && !error && suggestions.length === 0 && <li className={styles.feedback}>Không tìm thấy kết quả</li>}
            
            {!isLoading && !error && suggestions.map((customer, index) => (
                <li 
                    key={customer.id} 
                    className={index === activeIndex ? styles.activeSuggestion : ''}
                    onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(customer); }}
                >
                    <strong>{customer.partnerName}</strong> - <span>{customer.id}</span>
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
                placeholder="Gõ để tìm khách hàng..."
                onFocus={handleInputChange}
            />
            <FiChevronDown className={styles.arrowIcon} />
            {showSuggestions && containerRef.current && <SuggestionsPortal />}
        </div>
    );
};

export default CustomerAutocomplete;