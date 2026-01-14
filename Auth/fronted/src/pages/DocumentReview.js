import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import authClient from '../api/authClient';

const DocumentReview = () => {
  const { user, isReviewer } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState('展厅');
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        console.log('Fetching RAGFlow datasets...');
        const data = await authClient.listRagflowDatasets();
        console.log('RAGFlow datasets response:', data);
        setDatasets(data.datasets || []);

        if (data.datasets && data.datasets.length > 0) {
          console.log('Setting default dataset:', data.datasets[0].name);
          setSelectedDataset(data.datasets[0].name);
        }
      } catch (err) {
        console.error('Failed to load datasets:', err);
        setDatasets([{ id: 'default', name: '展厅' }]);
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
    try {
      setLoading(true);
      console.log('Fetching RAGFlow documents for dataset:', selectedDataset);
      const data = await authClient.listRagflowDocuments(selectedDataset);
      console.log('RAGFlow response:', data);
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to fetch RAGFlow documents:', err);
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
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px' }}>{doc.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: doc.status === 'ready' ? '#10b981' : '#f59e0b',
                      color: 'white',
                      fontSize: '0.85rem',
                    }}>
                      {doc.status === 'ready' ? '就绪' : doc.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>
                    {selectedDataset}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {documents.length === 0 && (
            <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
              该知识库暂无文档
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentReview;
