import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { knowledgeApi } from '../features/knowledge/api';

const KnowledgeUpload = () => {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [kbId, setKbId] = useState('展厅');
  const [datasets, setDatasets] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        setLoadingDatasets(true);

        // 获取知识库列表（后端已经根据权限组过滤过了）
        const data = await knowledgeApi.listRagflowDatasets();
        const datasets = data.datasets || [];

        setDatasets(datasets);

        if (datasets.length > 0) {
          const defaultKb = datasets[0].name;
          setKbId(defaultKb);
        } else {
          setError('您没有被分配任何知识库权限，请联系管理员');
        }
      } catch (err) {
        setError('无法加载知识库列表，请检查网络连接');
        setDatasets([]);
      } finally {
        setLoadingDatasets(false);
      }
    };

    fetchDatasets();
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    console.log('[Upload Flow] Step 1 - File selected:', file?.name, 'Size:', file?.size);
    if (file) {
      const maxSize = 16 * 1024 * 1024;
      if (file.size > maxSize) {
        setError('文件大小不能超过16MB');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setError(null);
      console.log('[Upload Flow] Step 2 - File validated and stored in state');
    }
  };

  const handleKbIdChange = (e) => {
    const newKbId = e.target.value;
    console.log('[Upload Flow] Step 1.5 - KB selection changed:', {
      oldKbId: kbId,
      newKbId: newKbId,
      newKbIdType: typeof newKbId
    });
    setKbId(newKbId);
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    console.log('[Upload Flow] ========== UPLOAD START ==========');
    console.log('[Upload Flow] Step 3 - Upload button clicked');
    console.log('[Upload Flow] Step 4 - State check:', {
      selectedFile: selectedFile?.name,
      kbId: kbId,
      kbIdType: typeof kbId,
      datasetsCount: datasets.length,
      datasets: datasets.map(d => ({ id: d.id, name: d.name }))
    });

    if (!selectedFile) {
      setError('请选择文件');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    console.log('[Upload Flow] Step 5 - Calling authClient.uploadDocument with:', {
      fileName: selectedFile.name,
      kbId: kbId,
      kbIdType: typeof kbId
    });

    try {
      const result = await knowledgeApi.uploadDocument(selectedFile, kbId);
      console.log('[Upload Flow] Step 10 - Upload success:', result);
      setSuccess(`文件 "${result.filename}" 上传成功，等待审核`);
      setSelectedFile(null);
      setTimeout(() => navigate('/documents'), 1500);
    } catch (err) {
      console.log('[Upload Flow] Step 10 - Upload failed:', err);
      setError(err.message);
    } finally {
      console.log('[Upload Flow] ========== UPLOAD END ==========');
      setUploading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '24px' }}>上传知识库文档</h2>

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

      {success && (
        <div style={{
          backgroundColor: '#d1fae5',
          color: '#065f46',
          padding: '12px 16px',
          borderRadius: '4px',
          marginBottom: '20px',
        }}>
          {success}
        </div>
      )}

      <div style={{
        backgroundColor: 'white',
        padding: '32px',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        maxWidth: '600px',
      }}>
        <form onSubmit={handleUpload}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151',
            }}>
              知识库
            </label>
            <select
              value={kbId}
              onChange={handleKbIdChange}
              disabled={loadingDatasets}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                backgroundColor: loadingDatasets ? '#f3f4f6' : 'white',
              }}
            >
              {loadingDatasets ? (
                <option>加载知识库中...</option>
              ) : datasets.length > 0 ? (
                datasets.map((ds) => (
                  <option key={ds.id} value={ds.name}>
                    {ds.name}
                  </option>
                ))
              ) : (
                <option value="展厅">展厅</option>
              )}
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151',
            }}>
              选择文件
            </label>
            <div style={{
              border: '2px dashed #d1d5db',
              borderRadius: '4px',
              padding: '40px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.borderColor = '#3b82f6'}
            onMouseLeave={(e) => e.target.style.borderColor = '#d1d5db'}
            >
              <input
                type="file"
                onChange={handleFileSelect}
                accept=".txt,.pdf,.doc,.docx,.md,.ppt,.pptx"
                style={{ display: 'none' }}
                id="fileInput"
              />
              <label htmlFor="fileInput" style={{ cursor: 'pointer' }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📄</div>
                <div style={{ color: '#6b7280', marginBottom: '8px' }}>
                  {selectedFile ? selectedFile.name : '点击选择文件'}
                </div>
                {selectedFile && (
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </div>
                )}
              </label>
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#6b7280' }}>
              支持的文件类型: .txt, .pdf, .doc, .docx, .md, .ppt, .pptx (最大16MB)
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedFile || uploading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: !selectedFile || uploading ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: !selectedFile || uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? '上传中...' : '上传文档'}
          </button>
        </form>

        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '4px',
          fontSize: '0.9rem',
          color: '#6b7280',
        }}>
          <div style={{ marginBottom: '8px', fontWeight: '500', color: '#374151' }}>
            上传流程:
          </div>
          <ol style={{ margin: 0, paddingLeft: '20px' }}>
            <li>选择文件并上传</li>
            <li>文档进入"待审核"状态</li>
            <li>审核员审核文档</li>
            <li>审核通过后自动上传到RAGFlow知识库</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeUpload;
