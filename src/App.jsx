import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';
import LoginPage from './components/LoginPage';
import AdminLayout from './components/AdminLayout';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Đang tải...</div>;
  }

  return (
    <div className="App">
      {user ? <AdminLayout /> : <LoginPage />}
    </div>
  );
}

export default App;