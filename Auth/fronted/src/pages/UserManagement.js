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

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    setCanManageUsers(can('users', 'manage'));
  }, [can]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await authClient.listUsers();
      setUsers(data);
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
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '0.9rem' }}>
                  {new Date(user.created_at_ms).toLocaleString('zh-CN')}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
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
    </div>
  );
};

export default UserManagement;
