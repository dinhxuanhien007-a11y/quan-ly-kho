// src/components/Navbar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { toast } from 'react-toastify';
import { 
    FiGrid, 
    FiArchive, 
    FiFilePlus,
    FiFileMinus,
    FiClipboard, 
    FiFileText, 
    FiShare2, 
    FiCheckSquare,
    FiUsers,
    FiBookOpen,
    FiUpload,
    FiSettings, // MỚI: Thêm icon cho trang quản lý user
    FiLogOut
} from 'react-icons/fi';
import '../styles/AdminLayout.css';

const Navbar = () => {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Đăng xuất thành công!');
      // Trang sẽ tự động chuyển về màn hình login do logic trong App.jsx
    } catch (error) {
      toast.error('Đã xảy ra lỗi khi đăng xuất.');
      console.error("Lỗi đăng xuất:", error);
    }
  };

  return (
    <nav className="top-navbar">
      <div className="navbar-brand">
        <h3>Kho PT Biomed</h3>
      </div>
      <ul className="nav-items">
        <li>
          <a href="/view" title="Xem Sổ Cái Tồn Kho">
            <FiBookOpen className="nav-icon" />
          </a>
        </li>
        <li>
          <NavLink to="/" title="Bảng điều khiển">
            <FiGrid className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/products" title="Quản lý hàng hóa">
            <FiArchive className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/partners" title="Quản lý Đối tác">
            <FiUsers className="nav-icon" />
          </NavLink>
        </li>
        {/* MỚI: Thêm mục menu Quản lý User */}
        <li>
          <NavLink to="/users" title="Quản lý User">
            <FiSettings className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/new-import" title="Tạo Phiếu Nhập">
            <FiFilePlus className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/new-export" title="Tạo Phiếu Xuất">
            <FiFileMinus className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/imports" title="Danh sách Phiếu Nhập">
            <FiClipboard className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/exports" title="Danh sách Phiếu Xuất">
           <FiFileText className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/stocktakes" title="Kiểm Kê Kho">
            <FiCheckSquare className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/lot-trace" title="Truy Vết Lô Hàng">
            <FiShare2 className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/import-data" title="Import Dữ Liệu">
            <FiUpload className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <a href="#" onClick={handleLogout} title="Đăng xuất">
            <FiLogOut className="nav-icon" />
          </a>
        </li>
      </ul>
    </nav>
  );
};

export default React.memo(Navbar);