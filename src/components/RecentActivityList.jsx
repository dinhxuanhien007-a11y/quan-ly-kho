import React from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../utils/dateUtils';
import Skeleton from 'react-loading-skeleton';

const RecentActivityList = ({ title, items, type, isLoading, onView }) => { // Thêm "onView"
    return (
        <div className="card">
            <h3>{title}</h3>
            {isLoading ? (
                <Skeleton count={5} height={30} style={{ marginBottom: '10px' }} />
            ) : items.length > 0 ? (
                <ul className="recent-activity-list">
                    {items.map(item => (
                        <li key={item.id}>
                            {/* THAY THẾ <Link> BẰNG <button> */}
                <button onClick={() => onView(item.id, type)} className="btn-link table-link">
                    {item.id}
                </button>
                <span>{type === 'import' ? item.supplierName : item.customer}</span>
                <span>{formatDate(item.createdAt)}</span>
            </li>
        ))}
    </ul>
            ) : (
                <p className="empty-message">Không có hoạt động nào gần đây.</p>
            )}
        </div>
    );
};

export default RecentActivityList;
