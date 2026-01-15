import React, { useEffect, useState } from 'react';
import authClient from '../api/authClient';

const Agents = () => {
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Search parameters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.2);
  const [topK, setTopK] = useState(30);
  const [keyword, setKeyword] = useState(false);
  const [highlight, setHighlight] = useState(false);

  // Load available datasets on mount
  useEffect(() => {
    fetchDatasets();
  }, []);

  const fetchDatasets = async () => {
    try {
      setLoading(true);
      const data = await authClient.getAvailableDatasets();
      setDatasets(data.datasets || []);

      // Select all datasets by default
      if (data.datasets && data.datasets.length > 0) {
        setSelectedDatasetIds(data.datasets.map(ds => ds.id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('请输入搜索关键词');
      return;
    }

    if (selectedDatasetIds.length === 0) {
      setError('请至少选择一个知识库');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await authClient.searchChunks({
        question: searchQuery,
        dataset_ids: selectedDatasetIds,
        page,
        page_size: pageSize,
        similarity_threshold: similarityThreshold,
        top_k: topK,
        keyword,
        highlight
      });

      // Debug: Log the first chunk to see its structure
      if (result.chunks && result.chunks.length > 0) {
        console.log('=== SEARCH RESULT DEBUG ===');
        console.log('[DEBUG] Total chunks:', result.chunks.length);
        console.log('[DEBUG] First chunk structure:', result.chunks[0]);
        console.log('[DEBUG] All chunk keys:', Object.keys(result.chunks[0]));
        console.log('[DEBUG] document_id:', result.chunks[0].document_id);
        console.log('[DEBUG] document_name:', result.chunks[0].document_name);
        console.log('[DEBUG] dataset_id:', result.chunks[0].dataset_id);
        console.log('[DEBUG] similarity:', result.chunks[0].similarity);
        console.log('[DEBUG] Full chunk data:', JSON.stringify(result.chunks[0], null, 2));
        console.log('=========================');
      }

      setSearchResults(result);
    } catch (err) {
      console.error('=== SEARCH ERROR ===');
      console.error('[ERROR] Search failed:', err);
      console.error('[ERROR] Error message:', err.message);
      console.error('[ERROR] Error stack:', err.stack);
      console.error('====================');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const toggleDataset = (datasetId) => {
    setSelectedDatasetIds(prev =>
      prev.includes(datasetId)
        ? prev.filter(id => id !== datasetId)
        : [...prev, datasetId]
    );
  };

  const selectAllDatasets = () => {
    setSelectedDatasetIds(datasets.map(ds => ds.id));
  };

  const clearDatasetSelection = () => {
    setSelectedDatasetIds([]);
  };

  const handleDownloadDocument = async (docId, docName, datasetId) => {
    try {
      setError(null);

      // Find the dataset name from the selected datasets
      const dataset = datasets.find(ds => ds.id === datasetId);
      const datasetName = dataset ? (dataset.name || dataset.id) : '展厅';

      // Use the existing download method from authClient
      // This will download the complete source file with the original filename
      await authClient.downloadRagflowDocument(docId, datasetName, docName);
    } catch (err) {
      setError(`下载文档失败: ${err.message}`);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', gap: '16px' }}>
      {/* Left sidebar: Dataset selection */}
      <div style={{ width: '280px', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          height: '100%',
          overflowY: 'auto'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>知识库</h3>

          <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
            <button
              onClick={selectAllDatasets}
              style={{
                flex: 1,
                padding: '6px',
                fontSize: '0.75rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              全选
            </button>
            <button
              onClick={clearDatasetSelection}
              style={{
                flex: 1,
                padding: '6px',
                fontSize: '0.75rem',
                backgroundColor: '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              清空
            </button>
          </div>

          {datasets.length === 0 ? (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
              暂无可用知识库
            </div>
          ) : (
            datasets.map(dataset => (
              <div
                key={dataset.id}
                onClick={() => toggleDataset(dataset.id)}
                style={{
                  padding: '10px',
                  marginBottom: '8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: selectedDatasetIds.includes(dataset.id) ? '#3b82f6' : '#f3f4f6',
                  color: selectedDatasetIds.includes(dataset.id) ? 'white' : '#1f2937',
                  border: selectedDatasetIds.includes(dataset.id) ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  fontSize: '0.875rem'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {dataset.name || dataset.id}
                </div>
                {dataset.description && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: selectedDatasetIds.includes(dataset.id) ? 'rgba(255,255,255,0.8)' : '#6b7280'
                  }}>
                    {dataset.description}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main content: Search and results */}
      <div style={{
        flex: 1,
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Search header */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入搜索关键词或问题..."
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Search options */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
            marginBottom: '12px'
          }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                相似度阈值: {similarityThreshold}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                Top-K: {topK}
              </label>
              <input
                type="number"
                min="1"
                max="1024"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value) || 30)}
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={keyword}
                  onChange={(e) => setKeyword(e.target.checked)}
                  style={{ marginRight: '6px' }}
                />
                关键词匹配
              </label>

              <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={highlight}
                  onChange={(e) => setHighlight(e.target.checked)}
                  style={{ marginRight: '6px' }}
                />
                高亮匹配
              </label>
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || selectedDatasetIds.length === 0 || loading}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: (!searchQuery.trim() || selectedDatasetIds.length === 0 || loading) ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!searchQuery.trim() || selectedDatasetIds.length === 0 || loading) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}
          >
            {loading ? '搜索中...' : '搜索'}
          </button>
        </div>

        {/* Search results */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px'
        }}>
          {!searchResults ? (
            <div style={{
              textAlign: 'center',
              color: '#9ca3af',
              marginTop: '60px'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔍</div>
              <div>输入关键词开始搜索知识库</div>
            </div>
          ) : searchResults.chunks && searchResults.chunks.length > 0 ? (
            <>
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                backgroundColor: '#f0f9ff',
                borderRadius: '4px',
                color: '#0369a1',
                fontSize: '0.875rem'
              }}>
                找到 {searchResults.total || 0} 个结果 (第 {page} 页)
              </div>

              {searchResults.chunks.map((chunk, index) => {
                // Extract document info - handle multiple possible field names
                const docId = chunk.document_id || chunk.doc_id || chunk.docid;
                const docName = chunk.document_name || chunk.doc_name || chunk.docname || chunk.filename || chunk.document_keyword;
                const datasetId = chunk.dataset_id || chunk.dataset || chunk.kb_id;

                return (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    marginBottom: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    backgroundColor: '#fafafa'
                  }}
                >
                  <div style={{
                    marginBottom: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {docName && (
                        <span style={{
                          fontSize: '0.875rem',
                          fontWeight: 'bold',
                          color: '#1f2937',
                          backgroundColor: '#f3f4f6',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          marginRight: '8px',
                          border: '1px solid #e5e7eb'
                        }}>
                          📄 {docName}
                        </span>
                      )}
                      {chunk.similarity !== undefined && (
                        <span style={{
                          fontSize: '0.75rem',
                          color: '#059669',
                          backgroundColor: '#d1fae5',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          相似度: {(chunk.similarity * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {docId && (
                        <button
                          onClick={() => handleDownloadDocument(docId, docName, datasetId)}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.875rem',
                            backgroundColor: '#059669',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: '500'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#047857'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#059669'}
                          title="下载完整源文件"
                        >
                          ⬇️ 下载
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '0.875rem',
                      lineHeight: '1.6',
                      color: '#1f2937',
                      whiteSpace: 'pre-wrap'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: chunk.content_with_weight || chunk.content || ''
                    }}
                  />
                </div>
                );
              })}

              {/* Pagination */}
              {searchResults.total && searchResults.total > pageSize && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: page <= 1 || loading ? '#9ca3af' : '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: page <= 1 || loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    上一页
                  </button>

                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    第 {page} / {Math.ceil(searchResults.total / pageSize)} 页
                  </span>

                  <button
                    onClick={() => {
                      setPage(p => p + 1);
                      handleSearch();
                    }}
                    disabled={page >= Math.ceil(searchResults.total / pageSize) || loading}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: page >= Math.ceil(searchResults.total / pageSize) || loading ? '#9ca3af' : '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: page >= Math.ceil(searchResults.total / pageSize) || loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{
              textAlign: 'center',
              color: '#9ca3af',
              marginTop: '60px'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📭</div>
              <div>未找到匹配的结果</div>
              <div style={{ fontSize: '0.875rem', marginTop: '8px' }}>
                尝试调整搜索关键词或降低相似度阈值
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          padding: '12px 16px',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          zIndex: 1000,
          maxWidth: '400px'
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: '12px', background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default Agents;
