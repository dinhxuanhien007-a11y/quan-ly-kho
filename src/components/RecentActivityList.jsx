import React from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../utils/dateUtils';
import Skeleton from 'react-loading-skeleton';

const RecentActivityList = ({ title, items, type, isLoading }) => {
    return (
        <div className="card">
            <h3>{title}</h3>
            {isLoading ? (
                <Skeleton count={5} height={30} style={{ marginBottom: '10px' }} />
            ) : items.length > 0 ? (
                <ul className="recent-activity-list">
                    {items.map(item => (
                        <li key={item.id}>
                            <Link to={`/${type}s`} className="table-link">{item.id}</Link>
                            <span>{type === 'import' ? item.supplier : item.customer}</span>
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