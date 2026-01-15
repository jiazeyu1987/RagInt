import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import authClient from '../api/authClient';

const DocumentReview = () => {
  const { user, isReviewer, isAdmin } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);  // 改为 null，等待数据加载
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        setLoadingDatasets(true);

        // 获取用户有权限的知识库列表
        const userKbData = await authClient.getMyKnowledgeBases();
        const userKbIds = userKbData.kb_ids || [];

        // 获取所有知识库
        const data = await authClient.listRagflowDatasets();
        const allKbs = data.datasets || [];

        // 过滤出用户有权限的知识库
        const accessibleKbs = allKbs.filter(kb => userKbIds.includes(kb.name));

        setDatasets(accessibleKbs);

        if (accessibleKbs.length > 0) {
          setSelectedDataset(accessibleKbs[0].name);
        } else {
          setError('您没有被分配任何知识库权限，请联系管理员');
        }
      } catch (err) {
        console.error('Failed to load datasets:', err);
        setError('无法加载知识库列表，请检查网络连接');
        setDatasets([]);
      } finally {
        setLoadingDatasets(false);
      }
    };

    fetchDatasets();
  }, []);

  useEffect(() => {
    fetchRagflowDocuments();
  }, [selectedDataset]);

  const fetchRagflowDocuments = async () => {
    if (!selectedDataset) return;

    try {
      setLoading(true);
      console.log('Fetching local pending documents for KB:', selectedDataset);
      // 获取本地待审核文档
      const data = await authClient.listDocuments({
        status: 'pending',
        kb_id: selectedDataset
      });
      console.log('Local pending documents response:', data);
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to fetch pending documents:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (docId) => {
    if (!window.confirm('确定要审核通过该文档吗？')) return;

    setActionLoading(docId);
    try {
      await authClient.approveDocument(docId);
      fetchRagflowDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (docId) => {
    const notes = window.prompt('请输入驳回原因（可选）');
    if (notes === null) return;

    setActionLoading(docId);
    try {
      await authClient.rejectDocument(docId, notes);
      fetchRagflowDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (docId) => {
    console.log('[DocumentReview] handleDelete called with docId:', docId);
    console.log('[DocumentReview] User role:', user?.role);
    console.log('[DocumentReview] isAdmin():', isAdmin());

    if (!window.confirm('确定要删除该文档吗？此操作不可恢复。')) return;

    setActionLoading(docId);
    try {
      console.log('[DocumentReview] Calling authClient.deleteDocument...');
      await authClient.deleteDocument(docId);
      console.log('[DocumentReview] Delete successful, refreshing documents...');
      fetchRagflowDocuments();
    } catch (err) {
      console.error('[DocumentReview] Delete failed:', err);
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 16px 0' }}>文档管理</h2>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <select
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value)}
            disabled={loadingDatasets}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.95rem',
              backgroundColor: 'white',
              cursor: 'pointer',
            }}
          >
            {loadingDatasets ? (
              <option>加载中...</option>
            ) : datasets.map((ds) => (
              <option key={ds.id} value={ds.name}>
                {ds.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          padding: '12px 16px',
          borderRadius: '4px',
          marginBottom: '20px',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#f9fafb' }}>
              <tr>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>文档名称</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>状态</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>知识库</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>上传者</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>上传时间</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.doc_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px' }}>{doc.filename}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: doc.status === 'pending' ? '#f59e0b' : '#10b981',
                      color: 'white',
                      fontSize: '0.85rem',
                    }}>
                      {doc.status === 'pending' ? '待审核' : doc.status === 'approved' ? '已通过' : doc.status === 'rejected' ? '已驳回' : doc.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>
                    {doc.kb_id}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>
                    {doc.uploaded_by}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '0.9rem' }}>
                    {new Date(doc.created_at_ms).toLocaleString('zh-CN')}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {(() => {
                      console.log('[DocumentReview] Rendering buttons for doc:', doc.doc_id);
                      console.log('[DocumentReview] doc.status:', doc.status);
                      console.log('[DocumentReview] isReviewer():', isReviewer());
                      console.log('[DocumentReview] isAdmin():', isAdmin());
                      return null;
                    })()}
                    {doc.status === 'pending' && isReviewer() ? (
                      <>
                        <button
                          onClick={() => handleApprove(doc.doc_id)}
                          disabled={actionLoading === doc.doc_id}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: actionLoading === doc.doc_id ? '#9ca3af' : '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: actionLoading === doc.doc_id ? 'not-allowed' : 'pointer',
                            fontSize: '0.9rem',
                            marginRight: '8px',
                          }}
                        >
                          {actionLoading === doc.doc_id ? '处理中...' : '通过'}
                        </button>
                        <button
                          onClick={() => handleReject(doc.doc_id)}
                          disabled={actionLoading === doc.doc_id}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: actionLoading === doc.doc_id ? '#9ca3af' : '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: actionLoading === doc.doc_id ? 'not-allowed' : 'pointer',
                            fontSize: '0.9rem',
                            marginRight: '8px',
                          }}
                        >
                          驳回
                        </button>
                      </>
                    ) : doc.status !== 'pending' ? (
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                        {doc.status === 'approved' ? '已通过' : '已驳回'}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>无权限</span>
                    )}
                    {isAdmin() && (
                      <button
                        onClick={() => handleDelete(doc.doc_id)}
                        disabled={actionLoading === doc.doc_id}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: actionLoading === doc.doc_id ? '#9ca3af' : '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: actionLoading === doc.doc_id ? 'not-allowed' : 'pointer',
                          fontSize: '0.9rem',
                          marginLeft: doc.status === 'pending' && isReviewer() ? '0' : '0',
                        }}
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {documents.length === 0 && (
            <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
              {selectedDataset ? `该知识库暂无待审核文档` : '请选择知识库'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentReview;
