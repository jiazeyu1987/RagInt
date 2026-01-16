import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { permissionGroupsApi } from '../features/permissionGroups/api';
import { usersApi } from '../features/users/api';

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
    group_ids: [],
  });

  // 权限组相关 state
  const [availableGroups, setAvailableGroups] = useState([]);
  const [editingGroupUser, setEditingGroupUser] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);

  useEffect(() => {
    fetchUsers();
    fetchPermissionGroups();
  }, []);

  useEffect(() => {
    setCanManageUsers(can('users', 'manage'));
  }, [can]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await usersApi.list();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissionGroups = async () => {
    try {
      const data = await permissionGroupsApi.list();
      if (data.ok) {
        setAvailableGroups(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load permission groups:', err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await usersApi.create(newUser);
      setShowCreateModal(false);
      setNewUser({ username: '', password: '', email: '', group_ids: [] });
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('确定要删除该用户吗？')) return;

    try {
      await usersApi.remove(userId);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  // 权限组相关函数
  const handleAssignGroup = async (user) => {
    try {
      setEditingGroupUser(user);
      // 从 permission_groups 中提取 group_ids，确保正确预选
      const groupIds = user.group_ids || (user.permission_groups || []).map(pg => pg.group_id);
      setSelectedGroupIds(groupIds);
      setShowGroupModal(true);
      console.log('编辑用户权限组:', user.username, '已有权限组:', groupIds);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveGroup = async () => {
    try {
      await usersApi.update(editingGroupUser.user_id, {
        group_ids: selectedGroupIds
      });
      setShowGroupModal(false);
      setEditingGroupUser(null);
      setSelectedGroupIds([]);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCloseGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroupUser(null);
    setSelectedGroupIds([]);
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
              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>状态</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>权限组</th>
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
                    color: user.status === 'active' ? '#10b981' : '#ef4444',
                  }}>
                    {user.status === 'active' ? '激活' : '停用'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {user.permission_groups && user.permission_groups.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {user.permission_groups.map((pg) => (
                        <span
                          key={pg.group_id}
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#e0e7ff',
                            color: '#4338ca',
                            fontSize: '0.85rem',
                          }}
                        >
                          {pg.group_name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>未分配</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '0.9rem' }}>
                  {new Date(user.created_at_ms).toLocaleString('zh-CN')}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <button
                    onClick={() => handleAssignGroup(user)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      marginRight: '8px',
                    }}
                  >
                    权限组
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
                  权限组 (可多选)
                </label>
                <div style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  padding: '12px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  backgroundColor: '#f9fafb',
                }}>
                  {availableGroups.length === 0 ? (
                    <div style={{ color: '#6b7280', textAlign: 'center', padding: '8px' }}>
                      暂无可用权限组
                    </div>
                  ) : (
                    availableGroups.map((group) => (
                      <label
                        key={group.group_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 0',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={newUser.group_ids?.includes(group.group_id) || false}
                          onChange={(e) => {
                            const groupIds = newUser.group_ids || [];
                            if (e.target.checked) {
                              setNewUser({ ...newUser, group_ids: [...groupIds, group.group_id] });
                            } else {
                              setNewUser({ ...newUser, group_ids: groupIds.filter(id => id !== group.group_id) });
                            }
                          }}
                          style={{ marginRight: '8px' }}
                        />
                        <div>
                          <div style={{ fontWeight: '500' }}>{group.group_name}</div>
                          {group.description && (
                            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                              {group.description}
                            </div>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
                {newUser.group_ids && newUser.group_ids.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#6b7280' }}>
                    已选择 {newUser.group_ids.length} 个权限组
                  </div>
                )}
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
                    setNewUser({ username: '', password: '', email: '', group_ids: [] });
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

      {/* 权限组分配模态框 */}
      {showGroupModal && editingGroupUser && (
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
          }}>
            <h3 style={{ margin: '0 0 24px 0' }}>
              分配权限组 - {editingGroupUser.username}
            </h3>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                选择权限组 (可多选)
              </label>
              <div style={{
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                padding: '12px',
                maxHeight: '300px',
                overflowY: 'auto',
                backgroundColor: '#f9fafb',
              }}>
                {availableGroups.length === 0 ? (
                  <div style={{ color: '#6b7280', textAlign: 'center', padding: '8px' }}>
                    暂无可用权限组
                  </div>
                ) : (
                  availableGroups.map((group) => (
                    <label
                      key={group.group_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 0',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroupIds?.includes(group.group_id) || false}
                        onChange={(e) => {
                          const groupIds = selectedGroupIds || [];
                          if (e.target.checked) {
                            setSelectedGroupIds([...groupIds, group.group_id]);
                          } else {
                            setSelectedGroupIds(groupIds.filter(id => id !== group.group_id));
                          }
                        }}
                        style={{ marginRight: '8px' }}
                      />
                      <div>
                        <div style={{ fontWeight: '500' }}>{group.group_name}</div>
                        {group.description && (
                          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                            {group.description}
                          </div>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
              {selectedGroupIds && selectedGroupIds.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#6b7280' }}>
                  已选择 {selectedGroupIds.length} 个权限组
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={handleCloseGroupModal}
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
                onClick={handleSaveGroup}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
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
