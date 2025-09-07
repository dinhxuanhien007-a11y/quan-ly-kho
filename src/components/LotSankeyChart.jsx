// src/components/LotSankeyChart.jsx

import React from 'react';
import { Sankey, ResponsiveContainer, Tooltip, Rectangle } from 'recharts';

// Hàm xử lý dữ liệu (Cập nhật để tên node chứa cả giá trị)
const processDataForSankey = (importRecords, exportHistory) => {
  if (!importRecords || importRecords.length === 0) {
    return { nodes: [], links: [] };
  }

  const totalImported = importRecords.reduce((sum, rec) => sum + rec.quantityImported, 0);
  const totalExported = exportHistory.reduce((sum, rec) => sum + rec.quantityExported, 0);
  const totalRemaining = totalImported - totalExported;

  const nodes = [];
  const links = [];

  // Gộp tên và giá trị vào thuộc tính 'name'
  nodes.push({ name: `Tổng Nhập: ${totalImported}`, color: '#8884d8' });
  nodes.push({ name: `Lô Hàng: ${totalImported}`, color: '#6683a3' });
  links.push({ source: 0, target: 1, value: totalImported });

  const customerNodes = {};
  exportHistory.forEach(exp => {
    if (!customerNodes[exp.customer]) {
      customerNodes[exp.customer] = { name: exp.customer, total: 0 };
    }
    customerNodes[exp.customer].total += exp.quantityExported;
  });

  Object.values(customerNodes).forEach(customer => {
    nodes.push({ name: `${customer.name}: ${customer.total}`, color: '#82ca9d' });
  });

  let customerIndexOffset = 2;
  Object.values(customerNodes).forEach((customer, index) => {
    links.push({
      source: 1,
      target: customerIndexOffset + index,
      value: customer.total,
    });
  });

  if (totalRemaining > 0) {
    nodes.push({ name: `Tồn Kho: ${totalRemaining}`, color: '#ffc658' });
    links.push({
      source: 1,
      target: nodes.length - 1,
      value: totalRemaining,
    });
  }

  return { nodes, links };
};

// Component tùy chỉnh cho Tooltip khi di chuột
const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length && payload[0].source && payload[0].target) {
        // Lấy lại tên gốc không có giá trị để tooltip gọn hơn
        const sourceName = payload[0].source.name.split(':')[0];
        const targetName = payload[0].target.name.split(':')[0];
        const { value } = payload[0];
        return (
            <div className="custom-tooltip" style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '5px'
            }}>
                <p>{`${sourceName} → ${targetName}: ${value}`}</p>
            </div>
        );
    }
    return null;
};


const LotSankeyChart = ({ importRecords, exportHistory }) => {
  const data = processDataForSankey(importRecords, exportHistory);

  if (!data || data.links.length === 0) {
    return null;
  }

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <Sankey
          data={data}
          // --- THAY ĐỔI QUAN TRỌNG ---
          // Bỏ component tùy chỉnh, dùng trực tiếp thuộc tính của thư viện
          node={(props) => <Rectangle {...props} fill={props.payload.color} />}
          label={{ 
            position: 'middle', 
            fill: 'white', 
            fontSize: 14,
            fontWeight: 'bold'
          }}
          nodePadding={60}
          margin={{
            left: 20,
            right: 20,
            top: 40,
            bottom: 40,
          }}
          link={{ stroke: 'rgba(170, 170, 170, 0.5)', strokeWidth: 10 }}
        >
          <Tooltip content={<CustomTooltip />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
};

export default LotSankeyChart;