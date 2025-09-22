import React from 'react';
import { FiTrendingUp, FiAlertTriangle, FiPackage, FiUsers } from 'react-icons/fi';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const StatCard = ({ icon, title, value, isLoading }) => {
    return (
        <div className="stat-card">
            <div className="stat-card-icon">{icon}</div>
            <div className="stat-card-info">
                <h4>{title}</h4>
                {isLoading ? <Skeleton width={50} /> : <p>{value}</p>}
            </div>
        </div>
    );
};

export default StatCard;