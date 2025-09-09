// src/components/Navbar.jsx

import React from 'react';
import { NavLink } from 'react-router-dom';
// --- THAY ĐỔI: IMPORT BỘ ICON MỚI ---
import { 
    FiGrid, 
    FiArchive, 
    FiFilePlus,   // Icon mới cho Tạo Phiếu Nhập
    FiFileMinus,  // Icon mới cho Tạo Phiếu Xuất
    FiClipboard, 
    FiFileText, 
    FiShare2, 
    FiCheckSquare 
} from 'react-icons/fi';
import '../styles/AdminLayout.css';

const Navbar = () => {
  return (
    <nav className="top-navbar">
      <div className="navbar-brand">
        <h3>Kho PT Biomed</h3>
      </div>
      <ul className="nav-items">
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
        {/* --- THAY ĐỔI: ICON TẠO PHIẾU NHẬP --- */}
        <li>
          <NavLink to="/new-import" title="Tạo Phiếu Nhập">
            <FiFilePlus className="nav-icon" />
          </NavLink>
        </li>
        {/* --- THAY ĐỔI: ICON TẠO PHIẾU XUẤT --- */}
        <li>
          <NavLink to="/new-export" title="Tạo Phiếu Xuất">
            <FiFileMinus className="nav-icon" />
          </NavLink>
        </li>
        {/* --- THAY ĐỔI: ICON DANH SÁCH PHIẾU NHẬP --- */}
        <li>
          <NavLink to="/imports" title="Danh sách Phiếu Nhập">
            <FiClipboard className="nav-icon" />
          </NavLink>
        </li>
        {/* --- THAY ĐỔI: ICON DANH SÁCH PHIẾU XUẤT --- */}
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
      </ul>
    </nav>
  );
};

export default Navbar;