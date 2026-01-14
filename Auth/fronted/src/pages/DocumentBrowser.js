import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import authClient from '../api/authClient';

const Spinner = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    style={{
      animation: 'spin 1s linear infinite',
    }}
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
      fill="none"
      strokeDasharray="32"
      strokeDashoffset="32"
      style={{
        strokeDashoffset: '32',
        animation: 'dash 1.5s ease-in-out infinite',
      }}
    />
  </svg>
);

const injectSpinnerStyles = () => {
  if (typeof document !== 'undefined' && !document.getElementById('spinner-styles')) {
    const style = document.createElement('style');
    style.id = 'spinner-styles';
    style.textContent = `
      @keyframes spin {
        100% { transform: rotate(360deg); }
      }
      @keyframes dash {
        0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
        50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
        100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
      }
    `;
    document.head.appendChild(style);
  }
};

if (typeof window !== 'undefined') {
  injectSpinnerStyles();
}

const DocumentBrowser = () => {
  const { user, can } = useAuth();
  const [datasets, setDatasets] = useState([]);
  const [documents, setDocuments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDatasets, setExpandedDatasets] = useState(new Set());
  const [actionLoading, setActionLoading] = useState({});
  const [selectedDocs, setSelectedDocs] = useState({});
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewDocName, setPreviewDocName] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [canDeleteDocs, setCanDeleteDocs] = useState(false);

  useEffect(() => {
    fetchAllDatasets();
  }, []);

  useEffect(() => {
    setCanDeleteDocs(can('ragflow_documents', 'delete'));
  }, [can, user?.user_id]);

  useEffect(() => {
    if (datasets.length > 0) {
      datasets.forEach((dataset) => {
        if (!documents[dataset.name]) {
          fetchDocumentsForDataset(dataset.name);
        }
      });
    }
  }, [datasets, documents]);

  const fetchAllDatasets = async () => {
    try {
      setLoading(true);
      const data = await authClient.listRagflowDatasets();
      setDatasets(data.datasets || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocumentsForDataset = async (datasetName) => {
    try {
      const data = await authClient.listRagflowDocuments(datasetName);
      setDocuments(prev => ({
        ...prev,
        [datasetName]: data.documents || []
      }));
    } catch (err) {
      console.error(`Failed to fetch documents for ${datasetName}:`, err);
      setDocuments(prev => ({
        ...prev,
        [datasetName]: []
      }));
    }
  };

  const toggleDataset = (datasetName) => {
    const newExpanded = new Set(expandedDatasets);
    if (newExpanded.has(datasetName)) {
      newExpanded.delete(datasetName);
    } else {
      newExpanded.add(datasetName);
      if (!documents[datasetName]) {
        fetchDocumentsForDataset(datasetName);
      }
    }
    setExpandedDatasets(newExpanded);
  };

  const expandAll = () => {
    const allDatasets = new Set(datasets.map(d => d.name));
    setExpandedDatasets(allDatasets);
    datasets.forEach((dataset) => {
      if (!documents[dataset.name]) {
        fetchDocumentsForDataset(dataset.name);
      }
    });
  };

  const collapseAll = () => {
    setExpandedDatasets(new Set());
  };

  const refreshAll = () => {
    setDocuments({});
    datasets.forEach((dataset) => {
      fetchDocumentsForDataset(dataset.name);
    });
  };

  const handleView = async (docId, datasetName) => {
    const doc = documents[datasetName]?.find(d => d.id === docId);
    const docName = doc?.name || `document_${docId}`;

    try {
      setPreviewLoading(true);
      setActionLoading(prev => ({ ...prev, [`${docId}-view`]: true }));
      setPreviewDocName(docName);

      const url = await authClient.previewRagflowDocument(docId, datasetName, docName);
      setPreviewUrl(url);
    } catch (err) {
      setError(err.message || '预览失败');
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
      setActionLoading(prev => ({ ...prev, [`${docId}-view`]: false }));
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewDocName(null);
  };

  const isPreviewable = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    const previewableExts = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'txt'];
    return previewableExts.includes(ext);
  };

  const handleDownload = async (docId, datasetName) => {
    const doc = documents[datasetName]?.find(d => d.id === docId);
    const docName = doc?.name || `document_${docId}`;

    try {
      setActionLoading(prev => ({ ...prev, [`${docId}-download`]: true }));
      await authClient.downloadRagflowDocument(docId, datasetName, docName);
    } catch (err) {
      setError(err.message || '下载失败');
    } finally {
      setActionLoading(prev => ({ ...prev, [`${docId}-download`]: false }));
    }
  };

  const handleDelete = async (docId, datasetName) => {
    if (!window.confirm('确定要删除该文档吗？此操作不可恢复。')) return;

    try {
      setActionLoading(prev => ({ ...prev, [`${docId}-delete`]: true }));
      await authClient.deleteRagflowDocument(docId, datasetName);

      setDocuments(prev => {
        const updated = { ...prev };
        if (updated[datasetName]) {
          updated[datasetName] = updated[datasetName].filter(d => d.id !== docId);
        }
        return updated;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [`${docId}-delete`]: false }));
    }
  };

  const canDelete = () => {
    return canDeleteDocs;
  };

  const handleSelectDoc = (docId, datasetName) => {
    setSelectedDocs(prev => {
      const datasetSelections = prev[datasetName] || [];
      const newSelections = datasetSelections.includes(docId)
        ? datasetSelections.filter(id => id !== docId)
        : [...datasetSelections, docId];
      return {
        ...prev,
        [datasetName]: newSelections
      };
    });
  };

  const handleSelectAllInDataset = (datasetName) => {
    const datasetDocs = documents[datasetName] || [];
    const currentSelections = selectedDocs[datasetName] || [];
    const allSelected = datasetDocs.length > 0 && currentSelections.length === datasetDocs.length;

    setSelectedDocs(prev => ({
      ...prev,
      [datasetName]: allSelected ? [] : datasetDocs.map(d => d.id)
    }));
  };

  const isDocSelected = (docId, datasetName) => {
    return (selectedDocs[datasetName] || []).includes(docId);
  };

  const isAllSelectedInDataset = (datasetName) => {
    const datasetDocs = documents[datasetName] || [];
    const currentSelections = selectedDocs[datasetName] || [];
    return datasetDocs.length > 0 && currentSelections.length === datasetDocs.length;
  };

  const getSelectedCount = () => {
    return Object.values(selectedDocs).reduce((total, selections) => total + selections.length, 0);
  };

  const clearAllSelections = () => {
    setSelectedDocs({});
  };

  const handleBatchDownload = async () => {
    const batchDownloadKey = 'batch-download';
    const allSelectedDocs = [];

    Object.entries(selectedDocs).forEach(([datasetName, docIds]) => {
      docIds.forEach(docId => {
        const doc = documents[datasetName]?.find(d => d.id === docId);
        if (doc) {
          allSelectedDocs.push({
            doc_id: docId,
            dataset_name: datasetName,
            name: doc.name
          });
        }
      });
    });

    if (allSelectedDocs.length === 0) {
      setError('请至少选择一个文档');
      return;
    }

    try {
      setError(null);
      setActionLoading(prev => ({ ...prev, [batchDownloadKey]: true }));

      await authClient.batchDownloadRagflowDocuments(allSelectedDocs);

      clearAllSelections();
    } catch (err) {
      setError(err.message || '批量下载失败');
    } finally {
      setActionLoading(prev => ({ ...prev, [batchDownloadKey]: false }));
    }
  };

  const getStatusColor = (status) => {
    if (status === 'ready') return '#10b981';
    if (status === 'processing') return '#f59e0b';
    return '#6b7280';
  };

  const getStatusName = (status) => {
    const names = {
      'ready': '就绪',
      'processing': '处理中',
      'failed': '失败',
    };
    return names[status] || status;
  };

  const getTotalDocumentCount = () => {
    return datasets.reduce((total, dataset) => {
      return total + (documents[dataset.name]?.length || 0);
    }, 0);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⏳</div>
          <div style={{ color: '#6b7280' }}>加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0' }}>文档浏览</h2>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
          查看所有知识库中的文档
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={expandAll}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          展开全部
        </button>
        <button
          onClick={collapseAll}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          折叠全部
        </button>
        <button
          onClick={refreshAll}
          style={{
            padding: '8px 16px',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          刷新
        </button>
        {getSelectedCount() > 0 && (
          <>
            <button
              onClick={handleBatchDownload}
              disabled={actionLoading['batch-download']}
              style={{
                padding: '8px 16px',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {actionLoading['batch-download'] ? (
                <>
                  <Spinner size={14} />
                  <span>打包中</span>
                </>
              ) : (
                `批量下载 (${getSelectedCount()})`
              )}
            </button>
            <button
              onClick={clearAllSelections}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              清除选择
            </button>
          </>
        )}
      </div>

      <div style={{
        backgroundColor: '#f9fafb',
        padding: '16px',
        borderRadius: '8px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', gap: '32px', fontSize: '0.9rem' }}>
          <div>
            <span style={{ color: '#6b7280' }}>知识库数量: </span>
            <strong>{datasets.length}</strong>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>文档总数: </span>
            <strong>{getTotalDocumentCount()}</strong>
          </div>
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

      {datasets.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          padding: '48px',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#6b7280',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📚</div>
          <div>暂无知识库</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {datasets.map((dataset) => {
            const datasetDocs = documents[dataset.name] || [];
            const isExpanded = expandedDatasets.has(dataset.name);
            const loadingDocs = !documents[dataset.name];

            return (
              <div
                key={dataset.id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleDataset(dataset.name)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#f9fafb',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#f9fafb'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      fontSize: '1.5rem',
                      transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}>
                      ▶
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#1f2937' }}>
                        {dataset.name}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '4px' }}>
                        {loadingDocs ? '加载中...' : `${datasetDocs.length} 个文档`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {datasetDocs.length > 0 && (
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                      }}>
                        {datasetDocs.length}
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '16px 20px' }}>
                    {loadingDocs ? (
                      <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>
                        加载文档中...
                      </div>
                    ) : datasetDocs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>
                        该知识库暂无文档
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                            <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '0.9rem', color: '#6b7280', width: '40px' }}>
                              <input
                                type="checkbox"
                                checked={isAllSelectedInDataset(dataset.name)}
                                onChange={() => handleSelectAllInDataset(dataset.name)}
                                style={{ cursor: 'pointer' }}
                              />
                            </th>
                            <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '0.9rem', color: '#6b7280' }}>
                              文档名称
                            </th>
                            <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '0.9rem', color: '#6b7280' }}>
                              状态
                            </th>
                            <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '0.9rem', color: '#6b7280' }}>
                              文档ID
                            </th>
                            <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '0.9rem', color: '#6b7280' }}>
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {datasetDocs.map((doc) => (
                            <tr
                              key={doc.id}
                              style={{ borderBottom: '1px solid #f3f4f6' }}
                            >
                              <td style={{ padding: '12px 8px', width: '40px' }}>
                                <input
                                  type="checkbox"
                                  checked={isDocSelected(doc.id, dataset.name)}
                                  onChange={() => handleSelectDoc(doc.id, dataset.name)}
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '12px 8px', fontSize: '0.95rem' }}>
                                {doc.name}
                              </td>
                              <td style={{ padding: '12px 8px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: getStatusColor(doc.status),
                                  color: 'white',
                                  fontSize: '0.8rem',
                                }}>
                                  {getStatusName(doc.status)}
                                </span>
                              </td>
                              <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '0.8rem', color: '#9ca3af' }}>
                                {doc.id.slice(0, 8)}...
                              </td>
                              <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={() => handleView(doc.id, dataset.name)}
                                    disabled={actionLoading[`${doc.id}-view`]}
                                    title="查看"
                                    style={{
                                      padding: '6px 12px',
                                      backgroundColor: '#8b5cf6',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '0.85rem',
                                      opacity: actionLoading[`${doc.id}-view`] ? 0.6 : 1,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    {actionLoading[`${doc.id}-view`] ? (
                                      <>
                                        <Spinner size={14} />
                                        <span>预览中</span>
                                      </>
                                    ) : (
                                      '查看'
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleDownload(doc.id, dataset.name)}
                                    disabled={actionLoading[`${doc.id}-download`]}
                                    title="下载"
                                    style={{
                                      padding: '6px 12px',
                                      backgroundColor: '#3b82f6',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '0.85rem',
                                      opacity: actionLoading[`${doc.id}-download`] ? 0.6 : 1,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    {actionLoading[`${doc.id}-download`] ? (
                                      <>
                                        <Spinner size={14} />
                                        <span>下载中</span>
                                      </>
                                    ) : (
                                      '下载'
                                    )}
                                  </button>
                                  {canDelete() && (
                                    <button
                                      onClick={() => handleDelete(doc.id, dataset.name)}
                                      disabled={actionLoading[`${doc.id}-delete`]}
                                      title="删除"
                                      style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        opacity: actionLoading[`${doc.id}-delete`] ? 0.6 : 1,
                                      }}
                                    >
                                      删除
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewUrl && (
        <div
          onClick={closePreview}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              width: '90%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}>
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1f2937' }}>
                {previewDocName}
              </h3>
              <button
                onClick={closePreview}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => e.target.style.color = '#1f2937'}
                onMouseLeave={(e) => e.target.style.color = '#6b7280'}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
              {previewLoading ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '400px',
                  gap: '16px'
                }}>
                  <Spinner size={32} />
                  <div style={{ color: '#6b7280' }}>加载中...</div>
                </div>
              ) : isPreviewable(previewDocName) ? (
                <iframe
                  src={previewUrl}
                  style={{
                    width: '100%',
                    height: '70vh',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                  title={previewDocName}
                />
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '48px',
                  color: '#6b7280'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📄</div>
                  <div style={{ fontSize: '1.1rem', marginBottom: '8px' }}>此文件类型不支持在线预览</div>
                  <div style={{ fontSize: '0.9rem' }}>
                    请使用"下载"按钮保存文件到本地查看
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentBrowser;
