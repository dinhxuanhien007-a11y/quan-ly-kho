// src/components/LotJourneyExplorer.jsx

import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

// Sửa đổi hàm này để nhận thêm totalRemaining
const processDataForFlow = (importRecords, exportHistory, totalRemaining) => {
    const initialNodes = [];
    const initialEdges = [];
    if (importRecords.length === 0) {
        return { initialNodes, initialEdges };
    }

    const masterInfo = importRecords[0];
    const totalImported = importRecords.reduce((sum, rec) => sum + rec.quantityImported, 0);
    const supplierName = masterInfo.supplierName || 'Không rõ';
    initialNodes.push({
        id: 'supplier-node',
        data: { label: `Nhà Cung Cấp: ${supplierName}`, type: 'supplier', name: supplierName },
        position: { x: 0, y: 150 },
        style: { background: '#fde68a', borderColor: '#ca8a04', whiteSpace: 'pre-wrap' },
    });
    initialNodes.push({
        id: 'lot-node',
        data: { label: `Lô: ${masterInfo.lotNumber}\nTổng nhập: ${totalImported}`, type: 'lot' },
        position: { x: 300, y: 150 },
        style: { background: '#a5b4fc', borderColor: '#4338ca', width: 180, whiteSpace: 'pre-wrap' },
    });
    initialEdges.push({
        id: 'edge-supplier-lot',
        source: 'supplier-node',
        target: 'lot-node',
        animated: true,
        label: `${totalImported} ${masterInfo.unit}`,
    });
    const customerNodes = {};
    exportHistory.forEach(exp => {
        if (!customerNodes[exp.customer]) {
            customerNodes[exp.customer] = { name: exp.customer, total: 0 };
        }
        customerNodes[exp.customer].total += exp.quantityExported;
    });
    const outputNodes = Object.values(customerNodes);
    
    // Sử dụng totalRemaining từ prop thay vì tính toán lại
    if (totalRemaining > 0) {
        outputNodes.push({ name: 'Tồn Kho', total: totalRemaining });
    }
    
    outputNodes.forEach((nodeItem, index) => {
        const yPos = index * 120;
        const nodeId = nodeItem.name.replace(/\s+/g, '-').toLowerCase();

        initialNodes.push({
            id: nodeId,
            data: { 
                label: `${nodeItem.name}\nSố lượng: ${nodeItem.total}`, 
                type: nodeItem.name === 'Tồn Kho' ? 'stock' : 'customer',
                name: nodeItem.name
            },
            position: { x: 600, y: yPos },
            style: { 
                background: nodeItem.name === 'Tồn Kho' ? '#d1d5db' : '#6ee7b7',
                borderColor: nodeItem.name === 'Tồn Kho' ? '#4b5563' : '#047857',
                whiteSpace: 'pre-wrap'
            },
        });

        initialEdges.push({
            id: `edge-lot-${nodeId}`,
            source: 'lot-node',
            target: nodeId,
            label: `${nodeItem.total} ${masterInfo.unit}`,
        });
    });

    return { initialNodes, initialEdges };
};

// Sửa đổi component để nhận prop totalRemaining
const LotJourneyExplorer = ({ importRecords, exportHistory, totalRemaining, onNodeClick, onPaneClick }) => {
    const { initialNodes, initialEdges } = useMemo(
        // Truyền totalRemaining vào hàm xử lý
        () => processDataForFlow(importRecords, exportHistory, totalRemaining),
        [importRecords, exportHistory, totalRemaining]
    );
    if (initialNodes.length === 0) {
        return null;
    }
    
    return (
        <div style={{ height: '500px', border: '1px solid #eee', borderRadius: '8px' }}>
            <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                fitView
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
            >
                <Background />
                <Controls /> 
            </ReactFlow>
        </div>
    );
};

export default LotJourneyExplorer;