export const authBackendUrl = (path) => {
  const baseUrl = process.env.REACT_APP_AUTH_URL || 'http://localhost:8001';
  return `${baseUrl}${path}`;
};

export default authBackendUrl;
