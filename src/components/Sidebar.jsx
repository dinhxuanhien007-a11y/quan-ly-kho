import React, { useState } from 'react';
import { FiHome, FiArchive, FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';
import '../styles/AdminLayout.css';

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="sidebar-header">
        <h2 className="logo">{collapsed ? "K" : "Kho PTB"}</h2>
        <button className="toggle-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <FiChevronsRight /> : <FiChevronsLeft />}
        </button>
      </div>
      <ul className="menu-items">
        <li>
          <a href="#">
            <FiHome className="menu-icon" />
            <span className="menu-text">Bảng điều khiển</span>
          </a>
        </li>
        <li>
          <a href="#">
            <FiArchive className="menu-icon" />
            <span className="menu-text">Quản lý hàng hóa</span>
          </a>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;