// src/components/TeamBarChart.jsx

import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import Skeleton from 'react-loading-skeleton';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const TeamBarChart = ({ chartData, isLoading }) => {
    const options = {
        responsive: true,
        plugins: {
            legend: { display: false },
            title: { display: true, text: 'Số Lượng Mã Hàng (SKU) Theo Team' },
        },
    };

    // --- LOGIC MỚI: Tự động tạo labels và data từ props ---
    const labels = Object.keys(chartData);
    const dataValues = Object.values(chartData);
    // ----------------------------------------------------

    const data = {
        labels: labels, // <-- Sử dụng labels động
        datasets: [
            {
                label: 'Số SKU',
                data: dataValues, // <-- Sử dụng data động
                backgroundColor: ['#007bff', '#28a745', '#6c757d'], // Giữ nguyên mảng màu
            },
        ],
    };

    return (
        <div className="card">
            {isLoading ? <Skeleton height={300} /> : <Bar options={options} data={data} />}
        </div>
    );
};

export default TeamBarChart;