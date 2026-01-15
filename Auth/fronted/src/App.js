import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import KnowledgeUpload from './pages/KnowledgeUpload';
import DocumentReview from './pages/DocumentReview';
import DocumentBrowser from './pages/DocumentBrowser';
import DocumentAudit from './pages/DocumentAudit';
import Chat from './pages/Chat';
import Agents from './pages/Agents';
import Unauthorized from './pages/Unauthorized';
import PermissionGuard from './components/PermissionGuard';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <PermissionGuard>
                <Layout>
                  <Dashboard />
                </Layout>
              </PermissionGuard>
            }
          />
          <Route
            path="/users"
            element={
              <PermissionGuard permission={{ resource: 'users', action: 'view' }}>
                <Layout>
                  <UserManagement />
                </Layout>
              </PermissionGuard>
            }
          />
          <Route
            path="/upload"
            element={
              <PermissionGuard permission={{ resource: 'kb_documents', action: 'upload' }}>
                <Layout>
                  <KnowledgeUpload />
                </Layout>
              </PermissionGuard>
            }
          />
          <Route
            path="/documents"
            element={
              <PermissionGuard permission={{ resource: 'kb_documents', action: 'view' }}>
                <Layout>
                  <DocumentReview />
                </Layout>
              </PermissionGuard>
            }
          />
          <Route
            path="/browser"
            element={
              <PermissionGuard permission={{ resource: 'ragflow_documents', action: 'view' }}>
                <Layout>
                  <DocumentBrowser />
                </Layout>
              </PermissionGuard>
            }
          />
          <Route
            path="/chat"
            element={
              <PermissionGuard>
                <Layout>
                  <Chat />
                </Layout>
              </PermissionGuard>
            }
          />
          <Route
            path="/agents"
            element={
              <PermissionGuard>
                <Layout>
                  <Agents />
                </Layout>
              </PermissionGuard>
            }
          />
          <Route
            path="/audit"
            element={
              <PermissionGuard allowedRoles={['admin']}>
                <Layout>
                  <DocumentAudit />
                </Layout>
              </PermissionGuard>
            }
          />
          <Route
            path="/unauthorized"
            element={
              <PermissionGuard>
                <Layout>
                  <Unauthorized />
                </Layout>
              </PermissionGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
