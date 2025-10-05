// src/pages/UsersPage.jsx

// --- BẮT ĐẦU THAY ĐỔI 1: Import thêm các component và icon cần thiết ---
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, rtdb, functions } from '../firebaseConfig'; // <-- THAY ĐỔI: Import functions đã cấu hình
import { ref, onValue } from 'firebase/database';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import Spinner from '../components/Spinner';
import { FiPlus, FiTrash2, FiEdit, FiUsers, FiWifi } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { httpsCallable } from "firebase/functions"; // <-- GIỮ LẠI
import ConfirmationModal from '../components/ConfirmationModal';
import EditAllowedUserModal from '../components/EditAllowedUserModal';
import AddAllowedUserModal from '../components/AddAllowedUserModal';
import HighlightText from '../components/HighlightText';
import StatCard from '../components/StatCard'; // Thêm StatCard

// Component con PresenceIndicator (giữ nguyên)
const PresenceIndicator = ({ status }) => {
    if (!status) {
        return <span style={{ color: '#888', fontStyle: 'italic' }}>Chưa từng hoạt động</span>;
    }

    if (status.isOnline) {
        return <span style={{ color: '#28a745', fontWeight: 'bold' }}>● Online</span>;
    }

    const lastChanged = new Date(status.last_changed);
    const now = new Date();
    const diffSeconds = Math.round((now - lastChanged) / 1000);

    if (diffSeconds < 60) return "vài giây trước";
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} ngày trước`;
};

// Component con UserStatus (giữ nguyên)
const UserStatus = ({ status }) => {
    if (status === 'Đã kích hoạt') {
        return <span className="status-badge status-completed">{status}</span>;
    }
    return <span className="status-badge status-pending">{status}</span>;
};


const UsersPage = () => {
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState(null);
    const [presenceData, setPresenceData] = useState({});

    // --- BẮT ĐẦU THAY ĐỔI 2: Tính toán các chỉ số thống kê ---
    const stats = useMemo(() => {
        const totalUsers = allUsers.length;
        const onlineUsers = Object.values(presenceData).filter(status => status && status.isOnline).length;
        return { totalUsers, onlineUsers };
    }, [allUsers, presenceData]);

    // Lắng nghe trạng thái hoạt động từ Realtime Database
    useEffect(() => {
        const statusRef = ref(rtdb, 'status/');
        const unsubscribe = onValue(statusRef, (snapshot) => {
            const data = snapshot.val();
            setPresenceData(data || {});
        });

        return () => unsubscribe();
    }, []);

    // Tải và hợp nhất dữ liệu từ Firestore
    const fetchAndMergeUsers = useCallback(async () => {
        setLoading(true);
        try {
            const allowlistQuery = query(collection(db, "allowlist"), orderBy("addedAt", "desc"));
            const allowlistSnapshot = await getDocs(allowlistQuery);
            const allowlist = allowlistSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const usersQuery = query(collection(db, "users"));
            const usersSnapshot = await getDocs(usersQuery);
            const usersMap = new Map(usersSnapshot.docs.map(doc => [doc.data().email, { uid: doc.id, ...doc.data() }]));

            const mergedUsers = allowlist.map(allowedUser => {
                const registeredUser = usersMap.get(allowedUser.email);
                return {
                    ...allowedUser,
                    uid: registeredUser?.uid || null,
                    createdAt: registeredUser?.createdAt?.toDate().toLocaleDateString('vi-VN') || 'N/A',
                    status: registeredUser ? 'Đã kích hoạt' : 'Chờ kích hoạt',
                };
            });
            setAllUsers(mergedUsers);
        } catch (error) {
            console.error("Lỗi khi tải và hợp nhất danh sách người dùng: ", error);
            toast.error("Không thể tải danh sách người dùng.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAndMergeUsers();
    }, [fetchAndMergeUsers]);
    
    // Lọc danh sách user dựa trên từ khóa tìm kiếm
    const filteredUsers = useMemo(() => {
        if (!searchTerm) return allUsers;
        return allUsers.filter(user => 
            user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.uid && user.uid.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [searchTerm, allUsers]);

    const openEditModal = (user) => {
        setUserToEdit(user);
        setIsEditModalOpen(true);
    };

    const handleDelete = async (user) => {
        setConfirmModal({ isOpen: false });
        toast.info(`Đang xóa ${user.email}...`);
        try {
            const deleteFunc = httpsCallable(functions, 'deleteUserAndAllowlist');
            await deleteFunc({ email: user.email });
            toast.success(`Đã xóa ${user.email} khỏi hệ thống.`);
            fetchAndMergeUsers();
        } catch (error) {
            console.error("Lỗi khi xóa:", error);
            toast.error(error.message);
        }
    };

    const promptForDelete = (user) => {
        let message = `Bạn có chắc muốn xóa ${user.email} khỏi danh sách được phép truy cập không?`;
        if (user.status === 'Đã kích hoạt') {
            message += " Hành động này cũng sẽ xóa tài khoản người dùng tương ứng khỏi hệ thống.";
        }
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xóa?",
            message: message,
            onConfirm: () => handleDelete(user),
            confirmText: "Vẫn xóa",
        });
    };

    return (
        <div>
            <ConfirmationModal {...confirmModal} onCancel={() => setConfirmModal({ isOpen: false })} />
            {isAddModalOpen && <AddAllowedUserModal onClose={() => setIsAddModalOpen(false)} onUserAdded={fetchAndMergeUsers} />}
            {isEditModalOpen && <EditAllowedUserModal onClose={() => setIsEditModalOpen(false)} onUserUpdated={fetchAndMergeUsers} userToEdit={userToEdit} />}

            <div className="page-header">
                <h1>Quản lý Người dùng & Quyền Truy cập</h1>
                <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
                    <FiPlus style={{ marginRight: '5px' }} />
                    Thêm Email
                </button>
            </div>

            {/* --- BẮT ĐẦU THAY ĐỔI 3: Thêm khu vực thống kê --- */}
            <div className="stats-grid" style={{ marginBottom: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <StatCard 
                    icon={<FiUsers />} 
                    title="Tổng số User" 
                    value={loading ? '...' : stats.totalUsers} 
                    isLoading={loading} 
                />
                <StatCard 
                    icon={<FiWifi />} 
                    title="Đang Online" 
                    value={loading ? '...' : stats.onlineUsers} 
                    isLoading={loading} 
                />
            </div>
      
            <p>Đây là danh sách các tài khoản được phép đăng nhập bằng tài khoản Google và trạng thái hoạt động của họ.</p>

            <div className="controls-container" style={{justifyContent: 'flex-start'}}>
                <div className="search-container" style={{maxWidth: '400px'}}>
                    <input
                        type="text"
                        placeholder="Tìm theo Email hoặc UID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            {loading ? <Spinner /> : (
                <table className="products-table">
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>UID</th>
                            <th>Trạng thái Kích hoạt</th>
                            <th>Trạng thái Hoạt động</th>
                            <th>Vai trò (Role)</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.length > 0 ? (
                            filteredUsers.map(user => (
                                <tr key={user.id}>
                                    <td><strong><HighlightText text={user.email} highlight={searchTerm} /></strong></td>
                                    <td><HighlightText text={user.uid || 'N/A'} highlight={searchTerm} /></td>
                                    <td><UserStatus status={user.status} /></td>
                                    <td>
                                        <PresenceIndicator status={presenceData[user.uid]} />
                                    </td>
                                    <td>
                                        <span className={`status-badge ${user.role === 'owner' ? 'status-completed' : (user.role === 'admin' ? 'status-pending' : 'status-cancelled')}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            <button 
                                                className="btn-icon btn-edit" 
                                                title="Chỉnh sửa vai trò"
                                                onClick={() => openEditModal(user)}
                                                disabled={user.role === 'owner'}
                                            >
                                                <FiEdit />
                                            </button>
                                            <button 
                                                className="btn-icon btn-delete" 
                                                title="Xóa quyền truy cập và tài khoản" 
                                                onClick={() => promptForDelete(user)}
                                                disabled={user.role === 'owner'}
                                            >
                                                <FiTrash2 />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center' }}>
                                    {searchTerm ? 'Không tìm thấy người dùng nào khớp với từ khóa.' : 'Chưa có người dùng nào trong hệ thống.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default UsersPage;