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

    const data = {
        labels: ['MED', 'BIO', 'Spare Part'],
        datasets: [
            {
                label: 'Số SKU',
                data: [chartData.MED, chartData.BIO, chartData['Spare Part']],
                backgroundColor: ['#007bff', '#28a745', '#6c757d'],
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