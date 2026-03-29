// src/components/ConflictResolutionModal.jsx
import { useState } from 'react';
import { FiAlertTriangle, FiCheck, FiX, FiUser, FiClock } from 'react-icons/fi';
import { formatNumber } from '../utils/numberUtils';
import { resolveConflict } from '../services/collaborativeStocktakeService';
import { toast } from 'react-toastify';
import { useAuth } from '../context/UserContext';

/**
 * Modal giải quyết xung đột khi 2 người nhập cùng 1 lô.
 * @param {Object} props
 * @param {string} props.sessionId
 * @param {{ lotId: string, productId: string, productName: string, lotNumber: string, entries: Object[] }} props.conflict
 * @param {Function} props.onResolve - callback sau khi giải quyết xong
 * @param {Function} props.onClose
 */
const ConflictResolutionModal = ({ sessionId, conflict, onResolve, onClose }) => {
    const { user } = useAuth();
    const [resolving, setResolving] = useState(false);

    const handleResolve = async (keptEntry, rejectedEntry) => {
        setResolving(true);
        try {
            await resolveConflict(sessionId, keptEntry.id, rejectedEntry.id, user.uid);
            toast.success(`Đã giải quyết xung đột — giữ số liệu của ${keptEntry.enteredByEmail || keptEntry.enteredBy}`);
            onResolve();
        } catch (err) {
            toast.error(err.message || 'Lỗi khi giải quyết xung đột');
        } finally {
            setResolving(false);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '16px'
        }}>
            <div style={{
                background: '#fff', borderRadius: '14px', padding: '24px',
                maxWidth: '520px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#fff3cd', borderRadius: '50%', padding: '8px', color: '#856404' }}>
                            <FiAlertTriangle size={20} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '16px' }}>Giải quyết xung đột</div>
                            <div style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>
                                {conflict.productId} — Lô {conflict.lotNumber || 'N/A'}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={resolving}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px', padding: '4px' }}>
                        <FiX />
                    </button>
                </div>

                <div style={{ fontSize: '13px', color: '#555', marginBottom: '16px', padding: '10px', background: '#f8f9fa', borderRadius: '8px' }}>
                    <strong>{conflict.productName}</strong> — 2 người đã nhập số liệu khác nhau cho cùng lô này.
                    Chọn số liệu nào bạn muốn giữ lại.
                </div>

                {/* Entries comparison */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    {conflict.entries.map((entry, idx) => (
                        <div key={entry.id} style={{
                            border: '2px solid #e9ecef', borderRadius: '10px', padding: '14px',
                            display: 'flex', flexDirection: 'column', gap: '8px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#888' }}>
                                <FiUser size={12} />
                                <span style={{ fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {entry.enteredByEmail || entry.enteredBy}
                                </span>
                            </div>
                            <div style={{ textAlign: 'center', padding: '10px 0' }}>
                                <div style={{ fontSize: '28px', fontWeight: 700, color: '#007bff' }}>
                                    {formatNumber(entry.countedQty)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#888' }}>{entry.unit || ''}</div>
                            </div>
                            {entry.note && (
                                <div style={{ fontSize: '12px', color: '#555', fontStyle: 'italic', borderTop: '1px solid #f0f0f0', paddingTop: '6px' }}>
                                    "{entry.note}"
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#aaa' }}>
                                <FiClock size={11} />
                                {formatTime(entry.enteredAt)}
                            </div>
                            <button
                                onClick={() => {
                                    const other = conflict.entries.find(e => e.id !== entry.id);
                                    handleResolve(entry, other);
                                }}
                                disabled={resolving}
                                style={{
                                    marginTop: '4px', padding: '8px', borderRadius: '8px',
                                    border: 'none', background: resolving ? '#ccc' : '#28a745',
                                    color: '#fff', fontWeight: 600, fontSize: '13px',
                                    cursor: resolving ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                }}
                            >
                                <FiCheck size={14} /> Giữ số liệu này
                            </button>
                        </div>
                    ))}
                </div>

                <button onClick={onClose} disabled={resolving}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #dee2e6', background: '#fff', color: '#555', cursor: 'pointer', fontSize: '14px' }}>
                    Để sau
                </button>
            </div>
        </div>
    );
};

export default ConflictResolutionModal;
