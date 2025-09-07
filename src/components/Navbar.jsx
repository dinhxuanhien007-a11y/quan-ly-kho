// src/components/Navbar.jsx

import React from 'react';
import { NavLink } from 'react-router-dom';
// Thêm icon FiShare2
import { FiGrid, FiArchive, FiLogIn, FiLogOut, FiClipboard, FiFileText, FiShare2 } from 'react-icons/fi';
import '../styles/AdminLayout.css';

const Navbar = () => {
  return (
    <nav className="top-navbar">
      <div className="navbar-brand">
        <h3>Kho PT Biomed</h3>
      </div>
      <ul className="nav-items">
        {/* ... các mục menu cũ ... */}
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
          <NavLink to="/new-import" title="Tạo Phiếu Nhập">
            <FiLogIn className="nav-icon" />
          </NavLink>
        </li>
        <li>
          <NavLink to="/new-export" title="Tạo Phiếu Xuất">
            <FiLogOut className="nav-icon" />
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
        {/* Thêm mục menu mới cho Truy Vết Lô Hàng */}
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