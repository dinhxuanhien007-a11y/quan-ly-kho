// src/components/ParticipantBanner.jsx
import { FiClipboard, FiArrowRight } from 'react-icons/fi';

const ParticipantBanner = ({ sessions, onNavigate }) => {
    if (!sessions || sessions.length === 0) return null;

    return (
        <div style={{ position: 'sticky', top: 0, zIndex: 100 }}>
            {sessions.map(session => (
                <div key={session.id} style={{
                    background: 'linear-gradient(135deg, #007bff, #0056b3)',
                    color: '#fff',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FiClipboard style={{ fontSize: '18px', flexShrink: 0 }} />
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>
                                Phiên kiểm kê đang chờ bạn
                            </div>
                            <div style={{ fontSize: '12px', opacity: 0.85 }}>
                                {session.name}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => onNavigate(session.id)}
                        style={{
                            background: '#fff',
                            color: '#007bff',
                            border: 'none',
                            borderRadius: '20px',
                            padding: '6px 14px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Tham gia <FiArrowRight />
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ParticipantBanner;
