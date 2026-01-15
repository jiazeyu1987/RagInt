import React, { useEffect, useState } from 'react';
import authClient from '../api/authClient';
import { useAuth } from '../hooks/useAuth';

const UserManagement = () => {
  const { can } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    role: 'viewer',
  });

  // 知识库权限相关 state
  const [availableKbs, setAvailableKbs] = useState([]);
  const [editingPermissionsUser, setEditingPermissionsUser] = useState(null);
  const [userKbPermissions, setUserKbPermissions] = useState([]);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [userKbMap, setUserKbMap] = useState({}); // 存储每个用户的权限列表

  useEffect(() => {
    fetchUsers();
    fetchKnowledgeBases();  // 加载知识库列表
  }, []);

  useEffect(() => {
    setCanManageUsers(can('users', 'manage'));
  }, [can]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await authClient.listUsers();
      setUsers(data);

      // 加载每个用户的知识库权限
      const kbMap = {};
      for (const user of data) {
        if (user.role === 'admin') {
          // 管理员自动拥有所有权限
          kbMap[user.user_id] = ['所有知识库'];
        } else {
          try {
            const kbData = await authClient.getUserKnowledgeBases(user.user_id);
            kbMap[user.user_id] = kbData.kb_ids || [];
          } catch (err) {
            console.error(`Failed to load KBs for user ${user.username}:`, err);
            kbMap[user.user_id] = [];
          }
        }
      }
      setUserKbMap(kbMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await authClient.createUser(newUser);
      setShowCreateModal(false);
      setNewUser({ username: '', password: '', email: '', role: 'viewer' });
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('确定要删除该用户吗？')) return;

    try {
      await authClient.deleteUser(userId);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  // 知识库权限相关函数
  const fetchKnowledgeBases = async () => {
    try {
      const data = await authClient.listRagflowDatasets();
      setAvailableKbs(data.datasets || []);
    } catch (err) {
      console.error('Failed to load KBs:', err);
      setError('无法加载知识库列表');
    }
  };

  const handleConfigurePermissions = async (user) => {
    try {
      setEditingPermissionsUser(user);
      const data = await authClient.getUserKnowledgeBases(user.user_id);
      setUserKbPermissions(data.kb_ids || []);
      setShowPermissionsModal(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSavePermissions = async () => {
    try {
      await authClient.batchGrantKnowledgeBases(
        [editingPermissionsUser.user_id],
        userKbPermissions
      );
      setShowPermissionsModal(false);
      setEditingPermissionsUser(null);
      alert('权限配置已保存');

      // 刷新用户列表和权限映射
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleClosePermissionsModal = () => {
    setShowPermissionsModal(false);
    setEditingPermissionsUser(null);
    setUserKbPermissions([]);
  };

  const getRoleColor = (role) => {
    const colors = {
      admin: '#ef4444',
      reviewer: '#f59e0b',
      operator: '#3b82f6',
      viewer: '#6b7280',
      guest: '#9ca3af',
    };
    return colors[role] || '#6b7280';
  };

  const getRoleName = (role) => {
    const names = {
      admin: '管理员',
      reviewer: '审核员',
      operator: '操作员',
      viewer: '查看者',
      guest: '访客',
    };
    return names[role] || role;
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        {canManageUsers && (
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            新建用户
          </button>
        )}
      </div>

      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f9fafb' }}>
            <tr>
              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>用户名</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>邮箱</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>角色</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>状态</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>知识库权限</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>创建时间</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px 16px' }}>{user.username}</td>
                <td style={{ padding: '12px 16px', color: '#6b7280' }}>{user.email || '-'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: getRoleColor(user.role),
                    color: 'white',
                    fontSize: '0.85rem',
                  }}>
                    {getRoleName(user.role)}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    color: user.status === 'active' ? '#10b981' : '#ef4444',
                  }}>
                    {user.status === 'active' ? '激活' : '停用'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '0.85rem', maxWidth: '300px' }}>
                  {userKbMap[user.user_id] && userKbMap[user.user_id].length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {userKbMap[user.user_id].map((kb, index) => (
                        <span key={index} style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          fontSize: '0.8rem',
                        }}>
                          {kb}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>未配置</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '0.9rem' }}>
                  {new Date(user.created_at_ms).toLocaleString('zh-CN')}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {user.role === 'admin' ? (
                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>管理员（所有权限）</span>
                  ) : (
                    <>
                      <button
                        onClick={() => handleConfigurePermissions(user)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#6366f1',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          marginRight: '8px',
                        }}
                      >
                        权限
                      </button>
                      {canManageUsers && user.username !== 'admin' && (
                        <button
                          onClick={() => handleDeleteUser(user.user_id)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                          }}
                        >
                          删除
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            暂无用户
          </div>
        )}
      </div>

      {canManageUsers && showCreateModal && (
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
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '400px',
          }}>
            <h3 style={{ margin: '0 0 24px 0' }}>新建用户</h3>
            <form onSubmit={handleCreateUser}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  用户名
                </label>
                <input
                  type="text"
                  required
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  密码
                </label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  邮箱
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  角色
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="viewer">查看者</option>
                  <option value="operator">操作员</option>
                  <option value="reviewer">审核员</option>
                  <option value="admin">管理员</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  创建
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewUser({ username: '', password: '', email: '', role: 'viewer' });
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 权限配置模态框 */}
      {showPermissionsModal && editingPermissionsUser && (
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
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 24px 0' }}>
              配置知识库权限 - {editingPermissionsUser.username}
            </h3>
            <div style={{ marginBottom: '24px' }}>
              <p style={{ margin: '0 0 16px 0', color: '#6b7280', fontSize: '0.9rem' }}>
                选择该用户可以访问的知识库：
              </p>
              {availableKbs.length === 0 ? (
                <div style={{ color: '#f59e0b', padding: '12px', backgroundColor: '#fef3c7', borderRadius: '4px' }}>
                  暂无可用知识库，请先在RAGFlow中创建知识库
                </div>
              ) : (
                <div style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}>
                  {availableKbs.map((kb) => (
                    <label
                      key={kb.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderBottom: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={userKbPermissions.includes(kb.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUserKbPermissions([...userKbPermissions, kb.name]);
                          } else {
                            setUserKbPermissions(userKbPermissions.filter(k => k !== kb.name));
                          }
                        }}
                        style={{
                          marginRight: '12px',
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer',
                        }}
                      />
                      <span style={{ flex: 1 }}>{kb.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={handleClosePermissionsModal}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={availableKbs.length === 0}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: availableKbs.length === 0 ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: availableKbs.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
