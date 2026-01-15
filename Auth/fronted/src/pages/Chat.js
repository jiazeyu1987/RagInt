import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import authClient from '../api/authClient';

const Chat = () => {
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, sessionId: null, sessionName: '' });

  const messagesEndRef = useRef(null);

  // 获取聊天助手列表
  useEffect(() => {
    fetchChats();
  }, []);

  // 当选中聊天助手时，获取会话列表
  useEffect(() => {
    if (selectedChatId) {
      fetchSessions();
      const chat = chats.find(c => c.id === selectedChatId);
      setSelectedChat(chat || null);
    } else {
      setSessions([]);
      setSelectedSessionId(null);
      setMessages([]);
    }
  }, [selectedChatId]);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchChats = async () => {
    try {
      setLoading(true);
      const data = await authClient.listMyChats();
      setChats(data.chats || []);
      if (data.chats && data.chats.length > 0) {
        setSelectedChatId(data.chats[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    if (!selectedChatId) return;

    try {
      const data = await authClient.listChatSessions(selectedChatId);
      setSessions(data.sessions || []);
      if (data.sessions && data.sessions.length > 0) {
        setSelectedSessionId(data.sessions[0].id);
        setMessages(data.sessions[0].messages || []);
      } else {
        setSelectedSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const createSession = async () => {
    if (!selectedChatId) return;

    try {
      const session = await authClient.createChatSession(selectedChatId, '新会话');
      setSessions([session, ...sessions]);
      setSelectedSessionId(session.id);
      setMessages(session.messages || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const selectSession = (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setSelectedSessionId(sessionId);
      setMessages(session.messages || []);
    }
  };

  const handleDeleteSession = (sessionId, sessionName) => {
    setDeleteConfirm({ show: true, sessionId, sessionName });
  };

  const confirmDeleteSession = async () => {
    if (!deleteConfirm.sessionId || !selectedChatId) return;

    try {
      await authClient.deleteChatSessions(selectedChatId, [deleteConfirm.sessionId]);

      // 从列表中移除已删除的 session
      setSessions(sessions.filter(s => s.id !== deleteConfirm.sessionId));

      // 如果删除的是当前选中的 session，清空消息
      if (selectedSessionId === deleteConfirm.sessionId) {
        setSelectedSessionId(null);
        setMessages([]);
      }

      setDeleteConfirm({ show: false, sessionId: null, sessionName: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  const cancelDeleteSession = () => {
    setDeleteConfirm({ show: false, sessionId: null, sessionName: '' });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !selectedChatId) return;

    const userMessage = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');

    try {
      let fullAssistantMessage = '';

      // 使用EventSource处理SSE流
      const response = await fetch(`${authClient.baseURL}/api/chats/${selectedChatId}/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authClient.accessToken}`
        },
        body: JSON.stringify({
          question: inputMessage,
          stream: true,
          session_id: selectedSessionId
        })
      });

      if (!response.ok) {
        throw new Error('发送消息失败');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // 添加空的助手消息占位符
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr.trim()) {
              try {
                const data = JSON.parse(dataStr);
                if (data.code === 0 && data.data && data.data.answer) {
                  fullAssistantMessage += data.data.answer;
                  // 更新最后一条助手消息
                  setMessages(prev => {
                    const newMessages = [...prev];
                    if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                      newMessages[newMessages.length - 1] = { role: 'assistant', content: fullAssistantMessage };
                    } else {
                      newMessages.push({ role: 'assistant', content: fullAssistantMessage });
                    }
                    return newMessages;
                  });
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      }

    } catch (err) {
      setError(err.message);
      // 发送失败，移除用户消息
      setMessages(prev => prev.slice(0, -1));
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', gap: '16px' }}>
      {/* 左侧：聊天助手和会话列表 */}
      <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* 聊天助手列表 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>聊天助手</h3>
          {chats.length === 0 ? (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
              暂无可用聊天助手
            </div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                style={{
                  padding: '8px 12px',
                  marginBottom: '8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: selectedChatId === chat.id ? '#3b82f6' : '#f3f4f6',
                  color: selectedChatId === chat.id ? 'white' : '#1f2937'
                }}
              >
                {chat.name || chat.id}
              </div>
            ))
          )}
        </div>

        {/* 会话列表 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>会话</h3>
            {selectedChatId && (
              <button
                onClick={createSession}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                新建
              </button>
            )}
          </div>
          {!selectedChatId ? (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
              请先选择聊天助手
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
              暂无会话，请新建
            </div>
          ) : (
            sessions.map(session => (
              <div
                key={session.id}
                style={{
                  padding: '8px 12px',
                  marginBottom: '8px',
                  borderRadius: '4px',
                  backgroundColor: selectedSessionId === session.id ? '#f3f4f6' : 'white',
                  border: selectedSessionId === session.id ? '1px solid #d1d5db' : '1px solid #e5e7eb'
                }}
              >
                <div
                  onClick={() => selectSession(session.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{session.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>
                    {new Date(session.create_time).toLocaleString('zh-CN')}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(session.id, session.name);
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#dc2626'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#ef4444'}
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧：聊天界面 */}
      <div style={{
        flex: 1,
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {!selectedChatId ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
            请选择一个聊天助手开始对话
          </div>
        ) : (
          <>
            {/* 聊天标题 */}
            <div style={{
              padding: '16px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb'
            }}>
              <h3 style={{ margin: 0 }}>{selectedChat?.name || selectedChatId}</h3>
            </div>

            {/* 消息列表 */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '40px' }}>
                  开始新的对话...
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div style={{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: msg.role === 'user' ? '#3b82f6' : '#f3f4f6',
                      color: msg.role === 'user' ? 'white' : '#1f2937',
                      wordBreak: 'break-word'
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 输入框 */}
            <div style={{
              padding: '16px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '8px'
            }}>
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="输入消息... (Enter发送，Shift+Enter换行)"
                disabled={!selectedChatId || loading}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  resize: 'none',
                  minHeight: '40px',
                  maxHeight: '120px',
                  fontFamily: 'inherit'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim() || !selectedChatId || loading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: inputMessage.trim() && selectedChatId && !loading ? '#3b82f6' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: inputMessage.trim() && selectedChatId && !loading ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap'
                }}
              >
                {loading ? '发送中...' : '发送'}
              </button>
            </div>
          </>
        )}
      </div>

      {error && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          padding: '12px 16px',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          zIndex: 1000
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: '12px', background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteConfirm.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', color: '#1f2937' }}>
              确认删除会话
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280', lineHeight: '1.5' }}>
              确定要删除会话 "<strong>{deleteConfirm.sessionName}</strong>" 吗？
              <br />
              <span style={{ color: '#ef4444', fontSize: '0.875rem' }}>
                此操作将从服务器和本地数据库中永久删除该会话及其所有消息，无法恢复。
              </span>
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelDeleteSession}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                取消
              </button>
              <button
                onClick={confirmDeleteSession}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
