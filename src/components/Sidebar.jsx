// src/components/Sidebar.jsx

import React, { useState } from 'react';
import { 
  FiHome, FiArchive, FiPlusCircle, FiMinusCircle, 
  FiFileText, FiChevronsLeft, FiChevronsRight, FiClipboard 
} from 'react-icons/fi'; // <-- Đã thêm FiClipboard
import { NavLink } from 'react-router-dom';
import '../styles/AdminLayout.css';
import { useAuth } from '../context/UserContext'; // <-- BƯỚC 1: Import useAuth

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { role } = useAuth(); // <-- BƯỚC 2: Lấy role hiện tại

  console.log("DEBUG ROLE:", role); // <--- THÊM DÒNG NÀY ĐỂ KIỂM TRA

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

        {/* === BƯỚC 3: CHỈ HIỂN THỊ NẾU LÀ OWNER === */}
        {role === 'owner' && (
            <li>
              <NavLink to="/inventory-check">
                <FiClipboard className="menu-icon" />
                <span className="menu-text">Đối chiếu Tồn kho</span>
              </NavLink>
            </li>
        )}
        {/* ========================================= */}

        <li>
          <NavLink to="/new-import">
            <FiPlusCircle className="menu-icon" />
            <span className="menu-text">Tạo Phiếu Nhập</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/new-export">
            <FiMinusCircle className="menu-icon" />
            <span className="menu-text">Tạo Phiếu Xuất</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/imports">
            <FiFileText className="menu-icon" />
            <span className="menu-text">DS Phiếu Nhập</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/exports">
            <FiFileText className="menu-icon" />
            <span className="menu-text">DS Phiếu Xuất</span>
          </NavLink>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;