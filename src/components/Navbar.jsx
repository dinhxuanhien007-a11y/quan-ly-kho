// src/components/Navbar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
    FiGrid, 
    FiArchive, 
    FiFilePlus,
    FiFileMinus,
    FiClipboard, 
    FiFileText, 
    FiShare2, 
    FiCheckSquare,
    FiTool, 
    FiUsers,
    FiBookOpen,
    FiUpload,
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
          <NavLink to="/partners" title="Quản lý Đối tác"><FiUsers className="nav-icon" /></NavLink>
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
      </ul>
    </nav>
  );
};

export default React.memo(Navbar);