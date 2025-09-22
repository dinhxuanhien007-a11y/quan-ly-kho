import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import Skeleton from 'react-loading-skeleton';

ChartJS.register(ArcElement, Tooltip, Legend);

const ExpiryPieChart = ({ chartData, isLoading }) => {
    const data = {
        labels: ['An toàn', 'Sắp hết hạn', 'Đã hết hạn'],
        datasets: [
            {
                label: 'Số lượng lô',
                data: [chartData.safe, chartData.near_expiry, chartData.expired],
                backgroundColor: ['#28a745', '#ffc107', '#dc3545'],
                borderColor: ['#ffffff', '#ffffff', '#ffffff'],
                borderWidth: 2,
            },
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Phân Bố Hạn Sử Dụng Theo Lô' },
        },
    };

    return (
        <div className="card">
            {isLoading ? <Skeleton height={300} /> : <Pie options={options} data={data} />}
        </div>
    );
};

export default ExpiryPieChart;