import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import authClient from '../api/authClient';

const DocumentAudit = () => {
  const { isAdmin, accessibleKbs } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [deletions, setDeletions] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('documents'); // 'documents', 'deletions', or 'downloads'
  const [filterKb, setFilterKb] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // 先获取用户列表
        let usersData;
        try {
          usersData = await authClient.listUsers();
        } catch (userErr) {
          usersData = [];
        }

        // 再获取文档列表
        let docsData;
        try {
          docsData = await authClient.listDocuments({});
        } catch (docErr) {
          docsData = { documents: [] };
        }

        // 获取删除记录列表
        let deletionsData;
        try {
          deletionsData = await authClient.listDeletions({});
        } catch (delErr) {
          deletionsData = { deletions: [] };
        }

        // 获取下载记录列表
        let downloadsData;
        try {
          downloadsData = await authClient.listDownloads({});
        } catch (downErr) {
          downloadsData = { downloads: [] };
        }

        // 后端 /api/users 直接返回数组，不是 {users: [...]}
        // 后端 /api/knowledge/documents 返回 {documents: [...]}
        // 后端 /api/knowledge/deletions 返回 {deletions: [...]}
        // 后端 /api/ragflow/downloads 返回 {downloads: [...]}
        const usersList = Array.isArray(usersData) ? usersData : (usersData.users || []);
        const docsList = docsData.documents || [];
        const delList = deletionsData.deletions || [];
        const downList = downloadsData.downloads || [];

        setUsers(usersList);
        setDocuments(docsList);
        setDeletions(delList);
        setDownloads(downList);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 用户ID映射
  const userMap = useMemo(() => {
    const map = new Map(users.map(u => [u.user_id, u.username]));
    return map;
  }, [users]);

  const getUploaderName = (uploaded_by) => {
    const name = userMap.get(uploaded_by);
    return name || '其他';
  };

  const getReviewerName = (reviewed_by) => {
    if (!reviewed_by) return '其他';
    const name = userMap.get(reviewed_by);
    return name || '其他';
  };

  const getDeleterName = (deleted_by) => {
    const name = userMap.get(deleted_by);
    return name || '其他';
  };

  const getDownloaderName = (downloaded_by) => {
    const name = userMap.get(downloaded_by);
    return name || '其他';
  };

  // 筛选文档（基于权限）
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      // 权限过滤：非管理员只能看到有权限的知识库
      if (!isAdmin() && accessibleKbs.length > 0 && !accessibleKbs.includes(doc.kb_id)) {
        return false;
      }

      if (filterKb && doc.kb_id !== filterKb) return false;
      if (filterStatus && doc.status !== filterStatus) return false;
      return true;
    });
  }, [documents, filterKb, filterStatus, isAdmin, accessibleKbs]);

  // 筛选删除记录（基于权限）
  const filteredDeletions = useMemo(() => {
    return deletions.filter(del => {
      // 权限过滤：非管理员只能看到有权限的知识库
      if (!isAdmin() && accessibleKbs.length > 0 && !accessibleKbs.includes(del.kb_id)) {
        return false;
      }

      if (filterKb && del.kb_id !== filterKb) return false;
      return true;
    });
  }, [deletions, filterKb, isAdmin, accessibleKbs]);

  // 筛选下载记录（基于权限）
  const filteredDownloads = useMemo(() => {
    return downloads.filter(down => {
      // 权限过滤：非管理员只能看到有权限的知识库
      if (!isAdmin() && accessibleKbs.length > 0 && !accessibleKbs.includes(down.kb_id)) {
        return false;
      }

      if (filterKb && down.kb_id !== filterKb) return false;
      return true;
    });
  }, [downloads, filterKb, isAdmin, accessibleKbs]);

  // 获取所有知识库列表（用于筛选器）- 基于权限过滤
  const knowledgeBases = useMemo(() => {
    const allKbs = Array.from(new Set([
      ...documents.map(d => d.kb_id),
      ...deletions.map(d => d.kb_id),
      ...downloads.map(d => d.kb_id)
    ]));

    // 非管理员只显示有权限的知识库
    if (!isAdmin() && accessibleKbs.length > 0) {
      return allKbs.filter(kb => accessibleKbs.includes(kb));
    }

    return allKbs;
  }, [documents, deletions, downloads, isAdmin, accessibleKbs]);

  // 时间格式化
  const formatTime = (timestamp_ms) => {
    if (!timestamp_ms) return '-';
    return new Date(timestamp_ms).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 状态映射
  const statusMap = {
    'pending': '待审核',
    'approved': '已通过',
    'rejected': '已驳回',
  };

  const getStatusStyle = (status) => {
    const styleMap = {
      'pending': { backgroundColor: '#f59e0b' },
      'approved': { backgroundColor: '#10b981' },
      'rejected': { backgroundColor: '#ef4444' },
    };
    return styleMap[status] || { backgroundColor: '#6b7280' };
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
        加载中...
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 16px 0' }}>文档审核记录</h2>

        {/* 选项卡切换 */}
        <div style={{ marginBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <button
            onClick={() => setActiveTab('documents')}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === 'documents' ? '#3b82f6' : 'transparent',
              color: activeTab === 'documents' ? 'white' : '#6b7280',
              border: 'none',
              borderBottom: activeTab === 'documents' ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: activeTab === 'documents' ? '600' : '400',
              marginRight: '8px',
            }}
          >
            文档列表 ({documents.length})
          </button>
          <button
            onClick={() => setActiveTab('deletions')}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === 'deletions' ? '#ef4444' : 'transparent',
              color: activeTab === 'deletions' ? 'white' : '#6b7280',
              border: 'none',
              borderBottom: activeTab === 'deletions' ? '2px solid #ef4444' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: activeTab === 'deletions' ? '600' : '400',
              marginRight: '8px',
            }}
          >
            删除记录 ({deletions.length})
          </button>
          <button
            onClick={() => setActiveTab('downloads')}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === 'downloads' ? '#10b981' : 'transparent',
              color: activeTab === 'downloads' ? 'white' : '#6b7280',
              border: 'none',
              borderBottom: activeTab === 'downloads' ? '2px solid #10b981' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: activeTab === 'downloads' ? '600' : '400',
            }}
          >
            下载记录 ({downloads.length})
          </button>
        </div>

        {/* 筛选器 */}
        {activeTab === 'documents' ? (
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ marginRight: '8px', fontSize: '0.9rem', color: '#6b7280' }}>知识库:</label>
              <select
                value={filterKb}
                onChange={(e) => setFilterKb(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
              >
                <option value="">所有知识库</option>
                {knowledgeBases.map(kb => (
                  <option key={kb} value={kb}>{kb}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ marginRight: '8px', fontSize: '0.9rem', color: '#6b7280' }}>状态:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
              >
                <option value="">所有状态</option>
                <option value="pending">待审核</option>
                <option value="approved">已通过</option>
                <option value="rejected">已驳回</option>
              </select>
            </div>

            {(filterKb || filterStatus) && (
              <button
                onClick={() => {
                  setFilterKb('');
                  setFilterStatus('');
                }}
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
                重置
              </button>
            )}

            <span style={{ marginLeft: 'auto', fontSize: '0.9rem', color: '#6b7280' }}>
              共 {filteredDocuments.length} 条记录
            </span>
          </div>
        ) : activeTab === 'deletions' ? (
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ marginRight: '8px', fontSize: '0.9rem', color: '#6b7280' }}>知识库:</label>
              <select
                value={filterKb}
                onChange={(e) => setFilterKb(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
              >
                <option value="">所有知识库</option>
                {knowledgeBases.map(kb => (
                  <option key={kb} value={kb}>{kb}</option>
                ))}
              </select>
            </div>

            {filterKb && (
              <button
                onClick={() => setFilterKb('')}
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
                重置
              </button>
            )}

            <span style={{ marginLeft: 'auto', fontSize: '0.9rem', color: '#6b7280' }}>
              共 {filteredDeletions.length} 条记录
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ marginRight: '8px', fontSize: '0.9rem', color: '#6b7280' }}>知识库:</label>
              <select
                value={filterKb}
                onChange={(e) => setFilterKb(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
              >
                <option value="">所有知识库</option>
                {knowledgeBases.map(kb => (
                  <option key={kb} value={kb}>{kb}</option>
                ))}
              </select>
            </div>

            {filterKb && (
              <button
                onClick={() => setFilterKb('')}
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
                重置
              </button>
            )}

            <span style={{ marginLeft: 'auto', fontSize: '0.9rem', color: '#6b7280' }}>
              共 {filteredDownloads.length} 条记录
            </span>
          </div>
        )}
      </div>

      {/* 错误提示 */}
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

      {/* 表格 */}
      {!loading && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        }}>
          {activeTab === 'documents' ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                  <thead style={{ backgroundColor: '#f9fafb' }}>
                    <tr>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>知识库</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>文件名</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>上传者</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>审核者</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>状态</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>上传时间</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>审核时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((doc, index) => (
                      <tr
                        key={doc.doc_id}
                        style={{
                          borderBottom: '1px solid #e5e7eb',
                          backgroundColor: index % 2 === 0 ? 'white' : '#f9fafb',
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{doc.kb_id}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{doc.filename}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#6b7280' }}>
                          {getUploaderName(doc.uploaded_by)}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#6b7280' }}>
                          {getReviewerName(doc.reviewed_by)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            color: 'white',
                            fontSize: '0.85rem',
                            ...getStatusStyle(doc.status),
                          }}>
                            {statusMap[doc.status] || doc.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#6b7280' }}>
                          {formatTime(doc.uploaded_at_ms)}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#6b7280' }}>
                          {doc.reviewed_at_ms ? formatTime(doc.reviewed_at_ms) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 空状态 */}
              {filteredDocuments.length === 0 && (
                <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                  {filterKb || filterStatus ? '没有符合条件的记录' : '暂无审核记录'}
                </div>
              )}
            </>
          ) : activeTab === 'deletions' ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                  <thead style={{ backgroundColor: '#fee2e2' }}>
                    <tr>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#991b1b' }}>知识库</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#991b1b' }}>文件名</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#991b1b' }}>原上传者</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#991b1b' }}>原审核者</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#991b1b' }}>删除者</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#991b1b' }}>删除时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeletions.map((del, index) => (
                      <tr
                        key={del.id}
                        style={{
                          borderBottom: '1px solid #e5e7eb',
                          backgroundColor: index % 2 === 0 ? 'white' : '#fef2f2',
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{del.kb_id}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{del.filename}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#6b7280' }}>
                          {getUploaderName(del.original_uploader)}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#6b7280' }}>
                          {getReviewerName(del.original_reviewer)}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#dc2626', fontWeight: '500' }}>
                          {getDeleterName(del.deleted_by)}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#6b7280' }}>
                          {formatTime(del.deleted_at_ms)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 空状态 */}
              {filteredDeletions.length === 0 && (
                <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                  {filterKb ? '没有符合条件的删除记录' : '暂无删除记录'}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                  <thead style={{ backgroundColor: '#d1fae5' }}>
                    <tr>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#065f46' }}>知识库</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#065f46' }}>文件名</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#065f46' }}>下载者</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#065f46' }}>下载时间</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600', color: '#065f46' }}>类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDownloads.map((down, index) => (
                      <tr
                        key={down.id}
                        style={{
                          borderBottom: '1px solid #e5e7eb',
                          backgroundColor: index % 2 === 0 ? 'white' : '#f0fdf4',
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{down.kb_id}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{down.filename}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#059669', fontWeight: '500' }}>
                          {getDownloaderName(down.downloaded_by)}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#6b7280' }}>
                          {formatTime(down.downloaded_at_ms)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            color: 'white',
                            fontSize: '0.85rem',
                            backgroundColor: down.is_batch ? '#059669' : '#10b981',
                          }}>
                            {down.is_batch ? '批量下载' : '单个下载'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 空状态 */}
              {filteredDownloads.length === 0 && (
                <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                  {filterKb ? '没有符合条件的下载记录' : '暂无下载记录'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentAudit;
