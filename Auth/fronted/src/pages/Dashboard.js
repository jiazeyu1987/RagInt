import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import authClient from '../api/authClient';

const Dashboard = () => {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [capabilities, setCapabilities] = useState({
    canBrowse: false,
    canViewKb: false,
    canUploadKb: false,
    canReviewKb: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const caps = {
          canBrowse: can('ragflow_documents', 'view'),
          canViewKb: can('kb_documents', 'view'),
          canUploadKb: can('kb_documents', 'upload'),
          canReviewKb: can('kb_documents', 'review'),
        };
        if (!cancelled) setCapabilities(caps);

        if (caps.canViewKb) {
          const data = await authClient.getStats();
          // Map API response format to expected format
          const mappedStats = {
            pending: data.pending_documents || 0,
            approved: data.approved_documents || 0,
            rejected: data.rejected_documents || 0,
            total: data.total_documents || 0
          };
          if (!cancelled) setStats(mappedStats);
        }
      } catch (e) {
        console.error('Dashboard init failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [can, user?.user_id]);

  const statCards = useMemo(() => {
    const cards = [
      {
        title: '待审核',
        value: stats.pending,
        color: '#f59e0b',
        action: () => navigate('/documents'),
        show: capabilities.canReviewKb,
      },
      {
        title: '已通过',
        value: stats.approved,
        color: '#10b981',
        action: () => navigate('/documents'),
        show: capabilities.canViewKb,
      },
      {
        title: '已驳回',
        value: stats.rejected,
        color: '#ef4444',
        action: () => navigate('/documents'),
        show: capabilities.canViewKb,
      },
      {
        title: '总文档',
        value: stats.total,
        color: '#3b82f6',
        action: () => navigate('/documents'),
        show: capabilities.canViewKb,
      },
    ];
    return cards.filter((c) => c.show);
  }, [capabilities, navigate, stats]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: '#1f2937' }}>欢迎，{user?.username}</h2>
        <p style={{ margin: '4px 0 0 0', color: '#6b7280' }}>角色：{user?.role}</p>
      </div>

      {statCards.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 20,
            marginBottom: 32,
          }}
        >
          {statCards.map((card) => (
            <div
              key={card.title}
              onClick={card.action}
              style={{
                backgroundColor: 'white',
                padding: 24,
                borderRadius: 8,
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                borderLeft: `4px solid ${card.color}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
              }}
            >
              <div style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 8 }}>
                {card.title}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: card.color }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {capabilities.canReviewKb && stats.pending > 0 && (
        <div
          style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ color: '#92400e', fontWeight: 500, marginBottom: 8 }}>
            当前有 {stats.pending} 个文档待审核
          </div>
          <button
            onClick={() => navigate('/documents')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            立即处理
          </button>
        </div>
      )}

      <div
        style={{
          backgroundColor: 'white',
          padding: 24,
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', color: '#1f2937' }}>快速操作</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {capabilities.canBrowse && (
            <button
              onClick={() => navigate('/browser')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              浏览文档
            </button>
          )}

          {capabilities.canUploadKb && (
            <button
              onClick={() => navigate('/upload')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              上传文档
            </button>
          )}

          {capabilities.canViewKb && (
            <button
              onClick={() => navigate('/documents')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              文档管理
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

