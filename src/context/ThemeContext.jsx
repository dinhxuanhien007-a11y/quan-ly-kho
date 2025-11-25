// src/context/ThemeContext.jsx

import React, { createContext, useState, useEffect, useContext } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Kiểm tra xem trong máy đã lưu chế độ dark chưa
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const savedTheme = localStorage.getItem('app-theme');
        return savedTheme === 'dark';
    });

    const toggleTheme = () => {
        setIsDarkMode(prev => !prev);
    };

    // Mỗi khi biến isDarkMode thay đổi, ta cập nhật class cho thẻ <body>
    useEffect(() => {
        const body = document.body;
        if (isDarkMode) {
            body.classList.add('dark-mode');
            localStorage.setItem('app-theme', 'dark');
        } else {
            body.classList.remove('dark-mode');
            localStorage.setItem('app-theme', 'light');
        }
    }, [isDarkMode]);

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

// Hook để các file khác gọi dùng dễ dàng
export const useTheme = () => useContext(ThemeContext);