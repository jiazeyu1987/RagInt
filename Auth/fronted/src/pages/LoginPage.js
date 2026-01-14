import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    setLoading(false);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || '登录失败');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f3f4f6',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: 40,
          borderRadius: 8,
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          width: '100%',
          maxWidth: 400,
        }}
      >
        <h1
          style={{
            textAlign: 'center',
            marginBottom: 30,
            color: '#1f2937',
            fontSize: '1.8rem',
          }}
        >
          登录
        </h1>

        {error && (
          <div
            style={{
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              padding: 12,
              borderRadius: 4,
              marginBottom: 20,
              fontSize: '0.9rem',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="on">
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 8,
                color: '#374151',
                fontWeight: 500,
              }}
            >
              用户名
            </label>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
              placeholder="输入用户名"
            />
          </div>

          <div style={{ marginBottom: 30 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 8,
                color: '#374151',
                fontWeight: 500,
              }}
            >
              密码
            </label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
              placeholder="输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 12,
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: '1rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) e.target.style.backgroundColor = '#2563eb';
            }}
            onMouseLeave={(e) => {
              if (!loading) e.target.style.backgroundColor = '#3b82f6';
            }}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: '0.85rem', color: '#6b7280' }}>
          <div>默认管理员账号：admin / admin123</div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

