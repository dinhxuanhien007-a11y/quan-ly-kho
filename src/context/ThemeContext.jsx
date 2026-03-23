// src/context/ThemeContext.jsx

import React, { createContext, useState, useEffect, useContext } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const savedTheme = localStorage.getItem('app-theme');
        return savedTheme === 'dark';
    });

    const toggleTheme = () => {
        setIsDarkMode(prev => !prev);
    };

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

    // Export cả isDarkMode lẫn theme để tương thích với tất cả component
    const theme = isDarkMode ? 'dark' : 'light';

    return (
        <ThemeContext.Provider value={{ isDarkMode, theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);