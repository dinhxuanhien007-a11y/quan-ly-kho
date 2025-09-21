import { useState, useEffect } from 'react';

// Hook này trả về true nếu chiều rộng màn hình nhỏ hơn 768px
export const useResponsive = () => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return isMobile;
};