import React, { useState, useEffect } from 'react';
import { permissionGroupsApi } from '../features/permissionGroups/api';

const PermissionGroupManagement = () => {
  const [groups, setGroups] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [chatAgents, setChatAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);

  const [formData, setFormData] = useState({
    group_name: '',
    description: '',
    accessible_kbs: [],
    accessible_chats: [],
    can_upload: false,
    can_review: false,
    can_download: true,
    can_delete: false
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [groupsData, kbData, chatData] = await Promise.all([
        permissionGroupsApi.list(),
        permissionGroupsApi.listKnowledgeBases().catch((e) => ({ ok: false, error: e?.message, data: [] })),
        permissionGroupsApi.listChats().catch((e) => ({ ok: false, error: e?.message, data: [] }))
      ]);

      setGroups(groupsData.data || []);

      if (kbData?.ok) {
        setKnowledgeBases(kbData.data || []);
      } else {
        if (kbData?.error) console.warn('知识库加载警告:', kbData.error);
        setKnowledgeBases([]);
      }

      if (chatData?.ok) {
        setChatAgents(chatData.data || []);
      } else {
        if (chatData?.error) console.warn('聊天体加载警告:', chatData.error);
        setChatAgents([]);
      }

      setError(null);
    } catch (err) {
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setFormData({
      group_name: '',
      description: '',
      accessible_kbs: [],
      accessible_chats: [],
      can_upload: false,
      can_review: false,
      can_download: true,
      can_delete: false
    });
    setShowCreateModal(true);
  };

  const handleEdit = (group) => {
    setSelectedGroup(group);
    setFormData({
      group_name: group.group_name,
      description: group.description || '',
      accessible_kbs: group.accessible_kbs || [],
      accessible_chats: group.accessible_chats || [],
      can_upload: group.can_upload || false,
      can_review: group.can_review || false,
      can_download: group.can_download !== false,
      can_delete: group.can_delete || false
    });
    setShowEditModal(true);
  };

  const handleDelete = (group) => {
    setGroupToDelete(group);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!groupToDelete) return;

    try {
      await permissionGroupsApi.remove(groupToDelete.group_id);

      setShowDeleteConfirm(false);
      setGroupToDelete(null);
      await fetchData();
    } catch (err) {
      setError(err.message || '删除失败');
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setGroupToDelete(null);
  };

  const handleSubmitCreate = async (e) => {
    e.preventDefault();

    try {
      await permissionGroupsApi.create(formData);

      setShowCreateModal(false);
      await fetchData();
    } catch (err) {
      setError(err.message || '创建失败');
    }
  };

  const handleSubmitEdit = async (e) => {
    e.preventDefault();

    try {
      await permissionGroupsApi.update(selectedGroup.group_id, formData);

      setShowEditModal(false);
      setSelectedGroup(null);
      await fetchData();
    } catch (err) {
      setError(err.message || '更新失败');
    }
  };

  const toggleKbAccess = (kbId) => {
    const newKbs = formData.accessible_kbs.includes(kbId)
      ? formData.accessible_kbs.filter(id => id !== kbId)
      : [...formData.accessible_kbs, kbId];
    setFormData({ ...formData, accessible_kbs: newKbs });
  };

  const toggleChatAccess = (chatId) => {
    const newChats = formData.accessible_chats.includes(chatId)
      ? formData.accessible_chats.filter(id => id !== chatId)
      : [...formData.accessible_chats, chatId];
    setFormData({ ...formData, accessible_chats: newChats });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div>加载中...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0' }}>权限组管理</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
            管理权限组、资源配置和操作权限
          </p>
        </div>
        <button
          onClick={handleCreate}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '500'
          }}
        >
          + 创建权限组
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          padding: '12px 16px',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                权限组名称
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                描述
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                知识库
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                聊天体
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                权限
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                用户数
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.group_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: '500', color: '#111827' }}>
                    {group.group_name}
                  </div>
                  {group.is_system === 1 && (
                    <span style={{
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      backgroundColor: '#f3f4f6',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      marginTop: '4px',
                      display: 'inline-block'
                    }}>
                      系统权限组
                    </span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '0.9rem' }}>
                  {group.description || '-'}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.85rem' }}>
                  {group.accessible_kbs?.length === 0 ? (
                    <span style={{ color: '#9ca3af' }}>全部</span>
                  ) : (
                    `${group.accessible_kbs?.length || 0} 个`
                  )}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.85rem' }}>
                  {group.accessible_chats?.length === 0 ? (
                    <span style={{ color: '#9ca3af' }}>全部</span>
                  ) : (
                    `${group.accessible_chats?.length || 0} 个`
                  )}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {group.can_upload && <span style={{ padding: '2px 6px', backgroundColor: '#dbeafe', color: '#1e40af', borderRadius: '4px' }}>上传</span>}
                    {group.can_review && <span style={{ padding: '2px 6px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '4px' }}>审核</span>}
                    {group.can_download && <span style={{ padding: '2px 6px', backgroundColor: '#d1fae5', color: '#065f46', borderRadius: '4px' }}>下载</span>}
                    {group.can_delete && <span style={{ padding: '2px 6px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>删除</span>}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280' }}>
                  {group.user_count || 0} 个用户
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleEdit(group)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      marginRight: '8px'
                    }}
                  >
                    编辑
                  </button>
                  {group.is_system !== 1 && (
                    <button
                      onClick={() => handleDelete(group)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan="7" style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                  暂无权限组
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 创建/编辑模态框 */}
      {(showCreateModal || showEditModal) && (
        <Modal
          title={showCreateModal ? '创建权限组' : '编辑权限组'}
          formData={formData}
          setFormData={setFormData}
          knowledgeBases={knowledgeBases}
          chatAgents={chatAgents}
          onSubmit={showCreateModal ? handleSubmitCreate : handleSubmitEdit}
          onClose={() => {
            setShowCreateModal(false);
            setShowEditModal(false);
            setSelectedGroup(null);
          }}
          toggleKbAccess={toggleKbAccess}
          toggleChatAccess={toggleChatAccess}
          isSystem={selectedGroup?.is_system === 1}
        />
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && groupToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            width: '400px',
            maxWidth: '90%'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: '600' }}>
              确认删除
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
              确定要删除权限组 "{groupToDelete.group_name}" 吗？此操作不可撤销。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={cancelDelete}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 模态框组件
const Modal = ({
  title,
  formData,
  setFormData,
  knowledgeBases,
  chatAgents,
  onSubmit,
  onClose,
  toggleKbAccess,
  toggleChatAccess,
  isSystem = false
}) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        width: '700px',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              权限组名称 *
            </label>
            <input
              type="text"
              value={formData.group_name}
              onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
              disabled={isSystem}
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '1rem',
                backgroundColor: isSystem ? '#f3f4f6' : 'white'
              }}
            />
            {isSystem && (
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '4px' }}>
                系统权限组的名称不能修改
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '1rem',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              可访问的知识库（留空表示全部）
            </label>
            <div style={{
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '12px',
              maxHeight: '150px',
              overflowY: 'auto',
              backgroundColor: '#f9fafb'
            }}>
              {knowledgeBases.length > 0 ? (
                knowledgeBases.map(kb => (
                  <label key={kb.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    padding: '4px',
                    borderRadius: '4px',
                    backgroundColor: 'white'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.accessible_kbs.includes(kb.id)}
                      onChange={() => toggleKbAccess(kb.id)}
                      style={{ marginRight: '8px' }}
                    />
                    {kb.name}
                  </label>
                ))
              ) : (
                <div style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '20px' }}>
                  暂无知识库可用
                  <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    请确保RAGFlow服务正在运行
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              可访问的聊天体（留空表示全部）
            </label>
            <div style={{
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '12px',
              maxHeight: '150px',
              overflowY: 'auto',
              backgroundColor: '#f9fafb'
            }}>
              {chatAgents.length > 0 ? (
                chatAgents.map(chat => (
                  <label key={chat.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    padding: '4px',
                    borderRadius: '4px',
                    backgroundColor: 'white'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.accessible_chats.includes(chat.id)}
                      onChange={() => toggleChatAccess(chat.id)}
                      style={{ marginRight: '8px' }}
                    />
                    {chat.name} ({chat.type === 'chat' ? '聊天' : '智能体'})
                  </label>
                ))
              ) : (
                <div style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '20px' }}>
                  暂无聊天体可用
                  <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    请确保RAGFlow服务正在运行
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              color: '#374151'
            }}>
              操作权限
            </label>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.can_upload}
                  onChange={(e) => setFormData({ ...formData, can_upload: e.target.checked })}
                  style={{ marginRight: '6px' }}
                />
                上传权限
              </label>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.can_review}
                  onChange={(e) => setFormData({ ...formData, can_review: e.target.checked })}
                  style={{ marginRight: '6px' }}
                />
                审核权限
              </label>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.can_download}
                  onChange={(e) => setFormData({ ...formData, can_download: e.target.checked })}
                  style={{ marginRight: '6px' }}
                />
                下载权限
              </label>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.can_delete}
                  onChange={(e) => setFormData({ ...formData, can_delete: e.target.checked })}
                  style={{ marginRight: '6px' }}
                />
                删除权限
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              取消
            </button>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PermissionGroupManagement;
