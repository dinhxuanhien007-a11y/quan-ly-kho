// src/hooks/useAuth.js

import { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';

export const useAuth = () => {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // Lấy token chứa custom claims (vai trò) để xác thực quyền
                const idTokenResult = await currentUser.getIdTokenResult();
                setUser(currentUser);
                setRole(idTokenResult.claims.role || null); // Gán vai trò từ token
            } else {
                setUser(null);
                setRole(null);
            }
            setLoading(false);
        });

        // Dọn dẹp listener khi component unmount
        return () => unsubscribe();
    }, []);

    return { user, role, loading };
};
