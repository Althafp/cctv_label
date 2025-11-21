import { useState, useEffect } from 'react'
import ImageViewer from './components/ImageViewer'
import Login from './components/Login'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const savedUsername = sessionStorage.getItem('username');
    if (savedUsername) {
      setUsername(savedUsername);
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = (user: string) => {
    setUsername(user);
    setIsAuthenticated(true);
    sessionStorage.setItem('username', user);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsername('');
    sessionStorage.removeItem('username');
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div>
      <div style={{ 
        background: '#667eea', 
        color: 'white', 
        padding: '10px 20px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
      }}>
        <div>
          <strong>Video Analytics Labeling</strong> - Logged in as: {username}
        </div>
        <button 
          onClick={handleLogout}
          style={{
            padding: '8px 16px',
            background: 'white',
            color: '#667eea',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Logout
        </button>
      </div>
      <ImageViewer />
    </div>
  );
}

export default App
