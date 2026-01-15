import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import authClient from '../api/authClient';
import ReactMarkdown from 'react-markdown';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

// Configure PDF.js worker to use local file
pdfjsLib.GlobalWorkerOptions.workerSrc = process.env.PUBLIC_URL + '/js/pdf.worker.min.mjs';

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
  const location = useLocation();
  const { user, can, canDownload, accessibleKbs } = useAuth();
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
  const [markdownContent, setMarkdownContent] = useState(null);
  const [docxContent, setDocxContent] = useState(null);
  const [docContent, setDocContent] = useState(null);
  const [pptxSlides, setPptxSlides] = useState(null);
  const [pptxCurrentSlide, setPptxCurrentSlide] = useState(0);
  const [excelData, setExcelData] = useState(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfScale, setPdfScale] = useState(1.5);
  const canvasRef = useRef(null);
  const [imageScale, setImageScale] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);
  const [canDeleteDocs, setCanDeleteDocs] = useState(false);

  useEffect(() => {
    fetchAllDatasets();
  }, [accessibleKbs, user]); // 当用户权限变化时重新加载

  // Inject table styles for Excel/DOCX preview
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('table-preview-styles')) {
      const style = document.createElement('style');
      style.id = 'table-preview-styles';
      style.textContent = `
        .table-preview table {
          border-collapse: collapse;
          width: 100%;
          font-size: 0.875rem;
        }
        .table-preview th,
        .table-preview td {
          border: 1px solid #d1d5db;
          padding: 8px 12px;
          text-align: left;
        }
        .table-preview th {
          background-color: #f3f4f6;
          font-weight: 600;
          color: #1f2937;
        }
        .table-preview tr:nth-child(even) {
          background-color: #f9fafb;
        }
        .table-preview tr:hover {
          background-color: #f3f4f6;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Render PDF page when document or page number changes
  useEffect(() => {
    if (pdfDocument && canvasRef.current) {
      const renderPage = async () => {
        const page = await pdfDocument.getPage(pdfCurrentPage);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        const viewport = page.getViewport({ scale: pdfScale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
      };

      renderPage();
    }
  }, [pdfDocument, pdfCurrentPage, pdfScale]);

  // Handle navigation from search page - locate and preview specific document
  useEffect(() => {
    if (location.state?.documentId && datasets.length > 0) {
      const { documentId, documentName, datasetId } = location.state;

      // Find the dataset name from datasetId
      const targetDataset = datasets.find(ds => ds.id === datasetId);
      if (!targetDataset) {
        setError(`无法找到知识库: ${datasetId}`);
        return;
      }

      const datasetName = targetDataset.name || targetDataset.id;

      // Expand the dataset
      setExpandedDatasets(prev => new Set([...prev, datasetName]));

      // Fetch documents for this dataset if not already loaded
      if (!documents[datasetName]) {
        fetchDocumentsForDataset(datasetName);
      }

      // Wait for documents to load, then preview the target document
      const checkAndPreview = setInterval(() => {
        if (documents[datasetName] && documents[datasetName].length > 0) {
          clearInterval(checkAndPreview);

          const targetDoc = documents[datasetName].find(doc => doc.id === documentId);
          if (targetDoc) {
            handleView(documentId, datasetName);
          } else {
            setError(`无法在知识库 "${datasetName}" 中找到文档: ${documentName}`);
          }
        }
      }, 500);

      // Cleanup interval after 10 seconds
      setTimeout(() => clearInterval(checkAndPreview), 10000);
    }
  }, [location.state, datasets, documents]);

  // 当用户切换时，清空之前的文档数据
  useEffect(() => {
    setDocuments({});
    setExpandedDatasets(new Set());
    setSelectedDocs({});
    setPreviewUrl(null);
  }, [user?.user_id]);

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

      // 获取所有知识库（后端已经根据权限组过滤过了）
      const data = await authClient.listRagflowDatasets();
      const datasets = data.datasets || [];

      // 直接使用后端返回的数据，不需要前端再次过滤
      setDatasets(datasets);

      // 如果没有知识库，显示提示
      if (datasets.length === 0) {
        setError('您没有被分配任何知识库权限，请联系管理员');
      } else {
        setError(null);
      }
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
      setMarkdownContent(null);
      setDocxContent(null);
      setDocContent(null);
      setPptxSlides(null);
      setPptxCurrentSlide(0);
      setExcelData(null);
      setPdfDocument(null);
      setPdfNumPages(0);
      setPdfCurrentPage(1);

      // Reset image state
      if (isImageFile(docName)) {
        setImageScale(1);
        setImageRotation(0);
      }

      if (isMarkdownFile(docName)) {
        const url = await authClient.previewRagflowDocument(docId, datasetName, docName);
        const response = await fetch(url);
        const text = await response.text();
        setMarkdownContent(text);
        setPreviewUrl(url);
      } else if (isDocFile(docName) || isDocxFile(docName)) {
        const url = await authClient.previewRagflowDocument(docId, datasetName, docName);
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (isDocFile(docName)) {
          setDocContent(result.value);
        } else {
          setDocxContent(result.value);
        }
        setPreviewUrl(url);
      } else if (isPptxFile(docName)) {
        const url = await authClient.previewRagflowDocument(docId, datasetName, docName);
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();

        // Parse PPTX (it's a ZIP file)
        const zip = await JSZip.loadAsync(arrayBuffer);
        const slideFiles = [];

        // Get all slide files
        for (let i = 1; i <= 999; i++) {
          const slidePath = `ppt/slides/slide${i}.xml`;
          const slideFile = zip.file(slidePath);
          if (!slideFile) break;

          const content = await slideFile.async('string');
          slideFiles.push({
            index: i,
            content: content
          });
        }

        setPptxSlides(slideFiles);
        setPptxCurrentSlide(0);
        setPreviewUrl(url);
      } else if (isExcelFile(docName)) {
        const url = await authClient.previewRagflowDocument(docId, datasetName, docName);
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetNames = workbook.SheetNames;
        const sheetsData = {};

        sheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const html = XLSX.utils.sheet_to_html(worksheet);
          sheetsData[sheetName] = html;
        });

        setExcelData(sheetsData);
        setPreviewUrl(url);
      } else if (isPdfFile(docName)) {
        const url = await authClient.previewRagflowDocument(docId, datasetName, docName);
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        setPdfDocument(pdf);
        setPdfNumPages(pdf.numPages);
        setPdfCurrentPage(1);
        setPreviewUrl(url);
      } else {
        const url = await authClient.previewRagflowDocument(docId, datasetName, docName);
        setPreviewUrl(url);
      }
    } catch (err) {
      setError(err.message || '预览失败');
      setPreviewUrl(null);
      setMarkdownContent(null);
      setDocxContent(null);
      setDocContent(null);
      setPptxSlides(null);
      setExcelData(null);
      setPdfDocument(null);
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
    setMarkdownContent(null);
    setDocxContent(null);
    setDocContent(null);
    setPptxSlides(null);
    setPptxCurrentSlide(0);
    setExcelData(null);
    setPdfDocument(null);
    setPdfNumPages(0);
    setPdfCurrentPage(1);
  };

  const isPreviewable = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    const previewableExts = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'txt', 'md', 'mdocx', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'];
    return previewableExts.includes(ext);
  };

  const isGenericPreviewable = (filename) => {
    // Only return true for txt files that use iframe preview
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'txt';
  };

  const isMarkdownFile = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'md' || ext === 'markdown';
  };

  const isDocxFile = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'docx';
  };

  const isDocFile = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'doc';
  };

  const isPptxFile = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'pptx';
  };

  const isPptFile = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'ppt';
  };

  const isExcelFile = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'xlsx' || ext === 'xls';
  };

  const isPdfFile = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'pdf';
  };

  const isImageFile = (filename) => {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext);
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
        {getSelectedCount() > 0 && canDownload() && (
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
                                  {canDownload() && (
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
                                  )}
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
              ) : isMarkdownFile(previewDocName) ? (
                <div style={{
                  padding: '24px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  height: '70vh',
                  overflow: 'auto',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{
                    fontSize: '0.875rem',
                    lineHeight: '1.6',
                    color: '#1f2937'
                  }}>
                    <ReactMarkdown>{markdownContent}</ReactMarkdown>
                  </div>
                </div>
              ) : isDocxFile(previewDocName) ? (
                <div className="table-preview" style={{
                  padding: '24px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  height: '70vh',
                  overflow: 'auto',
                  border: '1px solid #e5e7eb'
                }}>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      lineHeight: '1.6',
                      color: '#1f2937'
                    }}
                    dangerouslySetInnerHTML={{ __html: docxContent }}
                  />
                </div>
              ) : isDocFile(previewDocName) ? (
                <div className="table-preview" style={{
                  padding: '24px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  height: '70vh',
                  overflow: 'auto',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{
                    marginBottom: '16px',
                    padding: '8px 12px',
                    backgroundColor: '#fef3c7',
                    borderLeft: '4px solid #f59e0b',
                    fontSize: '0.875rem',
                    color: '#92400e'
                  }}>
                    ℹ️ 此为老版本Word文档（.doc），格式可能不完全准确
                  </div>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      lineHeight: '1.6',
                      color: '#1f2937'
                    }}
                    dangerouslySetInnerHTML={{ __html: docContent }}
                  />
                </div>
              ) : isPptxFile(previewDocName) ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '70vh',
                  backgroundColor: '#fef3c7',
                  borderRadius: '8px',
                  padding: '48px',
                  border: '2px solid #f59e0b'
                }}>
                  <div style={{ fontSize: '4rem', marginBottom: '24px' }}>📊</div>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: '#92400e',
                    marginBottom: '16px',
                    textAlign: 'center'
                  }}>
                    PowerPoint演示文稿（.pptx）
                  </div>
                  <div style={{
                    fontSize: '1rem',
                    color: '#78350f',
                    textAlign: 'center',
                    maxWidth: '600px',
                    marginBottom: '32px',
                    lineHeight: '1.6'
                  }}>
                    由于PPTX文件格式复杂，无法在浏览器中完整渲染视觉效果。<br />
                    建议您使用"下载"按钮保存文件后，使用Microsoft PowerPoint、WPS或其他兼容软件打开查看。
                  </div>
                  <div style={{
                    padding: '16px 24px',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fcd34d',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#92400e',
                    textAlign: 'center'
                  }}>
                    💡 <strong>提示：</strong>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', textAlign: 'left' }}>
                      <li>PPTX文件包含复杂的布局、动画和多媒体元素</li>
                      <li>浏览器无法完整渲染PowerPoint的视觉效果</li>
                      <li>下载后使用PowerPoint打开可获得完整体验</li>
                    </ul>
                  </div>
                </div>
              ) : isPptFile(previewDocName) ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '70vh',
                  backgroundColor: '#fef3c7',
                  borderRadius: '8px',
                  padding: '48px',
                  border: '2px solid #f59e0b'
                }}>
                  <div style={{ fontSize: '4rem', marginBottom: '24px' }}>📊</div>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: '#92400e',
                    marginBottom: '16px',
                    textAlign: 'center'
                  }}>
                    老版本PowerPoint文件（.ppt）
                  </div>
                  <div style={{
                    fontSize: '1rem',
                    color: '#78350f',
                    textAlign: 'center',
                    maxWidth: '500px',
                    marginBottom: '32px',
                    lineHeight: '1.6'
                  }}>
                    由于技术限制，老版本PPT文件（.ppt）无法在浏览器中直接预览。<br />
                    建议您使用"下载"按钮保存文件后，使用Microsoft PowerPoint或其他兼容软件打开。
                  </div>
                  <div style={{
                    padding: '16px 24px',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fcd34d',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#92400e',
                    textAlign: 'center'
                  }}>
                    💡 <strong>建议：</strong>如果可能，建议将PPT文件转换为PPTX格式后再上传，<br />
                    以获得更好的兼容性和在线预览体验。
                  </div>
                </div>
              ) : isExcelFile(previewDocName) ? (
                <div className="table-preview" style={{
                  padding: '24px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  height: '70vh',
                  overflow: 'auto',
                  border: '1px solid #e5e7eb'
                }}>
                  {Object.keys(excelData).map((sheetName, index) => (
                    <div key={sheetName} style={{ marginBottom: index < Object.keys(excelData).length - 1 ? '32px' : 0 }}>
                      <h3 style={{
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        marginBottom: '12px',
                        color: '#1f2937',
                        borderBottom: '2px solid #e5e7eb',
                        paddingBottom: '8px'
                      }}>
                        {sheetName}
                      </h3>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          overflow: 'auto'
                        }}
                        dangerouslySetInnerHTML={{ __html: excelData[sheetName] }}
                      />
                    </div>
                  ))}
                </div>
              ) : isPdfFile(previewDocName) ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '70vh',
                  backgroundColor: '#525659',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  {/* PDF Controls */}
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#323639',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    borderBottom: '1px solid #4a4e51'
                  }}>
                    <button
                      onClick={() => setPdfCurrentPage(p => Math.max(1, p - 1))}
                      disabled={pdfCurrentPage <= 1}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                        backgroundColor: pdfCurrentPage <= 1 ? '#4a4e51' : '#4a90e2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: pdfCurrentPage <= 1 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      上一页
                    </button>

                    <span style={{
                      color: '#fff',
                      fontSize: '0.875rem',
                      minWidth: '120px',
                      textAlign: 'center'
                    }}>
                      {pdfCurrentPage} / {pdfNumPages}
                    </span>

                    <button
                      onClick={() => setPdfCurrentPage(p => Math.min(pdfNumPages, p + 1))}
                      disabled={pdfCurrentPage >= pdfNumPages}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                        backgroundColor: pdfCurrentPage >= pdfNumPages ? '#4a4e51' : '#4a90e2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: pdfCurrentPage >= pdfNumPages ? 'not-allowed' : 'pointer'
                      }}
                    >
                      下一页
                    </button>

                    <div style={{ flex: 1 }} />

                    <select
                      value={pdfScale}
                      onChange={(e) => setPdfScale(parseFloat(e.target.value))}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                        backgroundColor: '#4a4e51',
                        color: 'white',
                        border: '1px solid #5a5e61',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value={0.75}>75%</option>
                      <option value={1}>100%</option>
                      <option value={1.25}>125%</option>
                      <option value={1.5}>150%</option>
                      <option value={2}>200%</option>
                    </select>
                  </div>

                  {/* PDF Canvas */}
                  <div style={{
                    flex: 1,
                    overflow: 'auto',
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '16px'
                  }}>
                    <canvas
                      ref={canvasRef}
                      style={{
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        maxWidth: '100%'
                      }}
                    />
                  </div>
                </div>
              ) : isImageFile(previewDocName) ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '70vh',
                  backgroundColor: '#1a1a1a',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  {/* Image Controls */}
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#2d2d2d',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    borderBottom: '1px solid #3d3d3d'
                  }}>
                    <button
                      onClick={() => setImageScale(s => Math.max(0.25, s - 0.25))}
                      disabled={imageScale <= 0.25}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                        backgroundColor: imageScale <= 0.25 ? '#3d3d3d' : '#4a90e2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: imageScale <= 0.25 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      缩小
                    </button>

                    <span style={{
                      color: '#fff',
                      fontSize: '0.875rem',
                      minWidth: '80px',
                      textAlign: 'center'
                    }}>
                      {Math.round(imageScale * 100)}%
                    </span>

                    <button
                      onClick={() => setImageScale(s => Math.min(5, s + 0.25))}
                      disabled={imageScale >= 5}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                        backgroundColor: imageScale >= 5 ? '#3d3d3d' : '#4a90e2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: imageScale >= 5 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      放大
                    </button>

                    <button
                      onClick={() => setImageScale(1)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                        backgroundColor: '#4a90e2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      重置
                    </button>

                    <div style={{ flex: 1 }} />

                    <button
                      onClick={() => setImageRotation(r => (r - 90) % 360)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                        backgroundColor: '#4a90e2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      ↺ 左旋
                    </button>

                    <button
                      onClick={() => setImageRotation(r => (r + 90) % 360)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                        backgroundColor: '#4a90e2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      右旋 ↻
                    </button>
                  </div>

                  {/* Image Display */}
                  <div style={{
                    flex: 1,
                    overflow: 'auto',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '16px'
                  }}>
                    <img
                      src={previewUrl}
                      alt={previewDocName}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        transform: `scale(${imageScale}) rotate(${imageRotation}deg)`,
                        transition: 'transform 0.3s ease',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)'
                      }}
                    />
                  </div>
                </div>
              ) : isGenericPreviewable(previewDocName) ? (
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
