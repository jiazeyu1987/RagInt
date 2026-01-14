import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const Unauthorized = () => {
  const location = useLocation();

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>无权限访问</h2>
      <div style={{ color: '#6b7280', marginBottom: 16 }}>
        当前账号没有权限访问该页面：{location.pathname}
      </div>
      <Link to="/" style={{ color: '#2563eb', textDecoration: 'none' }}>
        返回首页
      </Link>
    </div>
  );
};

export default Unauthorized;

