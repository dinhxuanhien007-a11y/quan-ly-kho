// src/context/UserContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import Spinner from '../components/Spinner';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribeSnapshot = null;

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            // Hủy listener Firestore cũ nếu có
            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
                unsubscribeSnapshot = null;
            }

            if (currentUser) {
                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const data = userDocSnap.data();
                    setRole(data.role);
                    setUserData(data);
                } else {
                    setRole(null);
                    setUserData(null);
                }
                setUser(currentUser);

                // Lắng nghe tokenRefreshRequired để tự động refresh token khi quyền thay đổi
                unsubscribeSnapshot = onSnapshot(userDocRef, async (snap) => {
                    if (!snap.exists()) return;
                    const data = snap.data();
                    setUserData(data);

                    // Nếu server yêu cầu refresh token, force lấy token mới
                    const freshUser = auth.currentUser;
                    if (freshUser && data.tokenRefreshRequired) {
                        const tokenResult = await freshUser.getIdTokenResult();
                        // So sánh thời điểm token hiện tại với yêu cầu refresh
                        const tokenIssuedAt = new Date(tokenResult.issuedAtTime).getTime();
                        if (data.tokenRefreshRequired > tokenIssuedAt) {
                            await freshUser.getIdToken(true); // force refresh
                        }
                    }
                });
            } else {
                setUser(null);
                setRole(null);
                setUserData(null);
            }
            setLoading(false);
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeSnapshot) unsubscribeSnapshot();
        };
    }, []);

    const value = {
        user,
        role,
        userData,
        loading,
    };

    if (loading) {
        return <Spinner />;
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    return useContext(AuthContext);
};