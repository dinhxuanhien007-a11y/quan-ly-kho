// src/components/Sidebar.jsx
import React, { useState } from 'react';
import { FiHome, FiArchive, FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';
import '../styles/AdminLayout.css';
import { NavLink } from 'react-router-dom'; // Dùng NavLink thay cho thẻ <a>

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
          <NavLink to="/"> {/* Link đến trang chủ */}
            <FiHome className="menu-icon" />
            <span className="menu-text">Bảng điều khiển</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/products"> {/* Link đến trang quản lý hàng hóa */}
            <FiArchive className="menu-icon" />
            <span className="menu-text">Quản lý hàng hóa</span>
          </NavLink>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;