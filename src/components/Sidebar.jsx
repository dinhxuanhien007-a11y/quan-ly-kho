// src/components/Sidebar.jsx

import React, { useState } from 'react';
// Gộp tất cả icon vào một dòng duy nhất
import { FiHome, FiArchive, FiLogIn, FiFileText, FiChevronsLeft, FiChevronsRight } from 'react-icons/fi'; 
import { NavLink } from 'react-router-dom';
import '../styles/AdminLayout.css';

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="sidebar-header">
        <h2 className="logo">{collapsed ? "K" : "Kho PT Biomed"}</h2>
        <button className="toggle-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <FiChevronsRight /> : <FiChevronsLeft />}
        </button>
      </div>
      <ul className="menu-items">
        <li>
          <NavLink to="/">
            <FiHome className="menu-icon" />
            <span className="menu-text">Bảng điều khiển</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/products">
            <FiArchive className="menu-icon" />
            <span className="menu-text">Quản lý hàng hóa</span>
          </NavLink>
        </li>
        {/* THÊM MỤC MENU MỚI */}
        <li>
          <NavLink to="/new-import">
            <FiLogIn className="menu-icon" />
            <span className="menu-text">Tạo Phiếu Nhập</span>
          </NavLink>
        </li>
          {/* THÊM MỤC MENU MỚI */}
        <li>
          <NavLink to="/imports">
            <FiFileText className="menu-icon" />
            <span className="menu-text">DS Phiếu Nhập</span>
          </NavLink>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;