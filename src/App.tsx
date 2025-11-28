import { useState, useEffect } from 'react'
import ImageViewer from './components/ImageViewer'
import Login from './components/Login'
import './App.css'

type DatasetType = 'existing' | 'ptz' | 'new_guntur';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDataset, setSelectedDataset] = useState<DatasetType>('existing');
  const [showDatasetSelector, setShowDatasetSelector] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const savedUsername = sessionStorage.getItem('username');
    const savedDataset = sessionStorage.getItem('dataset') as DatasetType | null;
      if (savedUsername) {
      setUsername(savedUsername);
      setIsAuthenticated(true);
      if (savedDataset === 'existing' || savedDataset === 'ptz' || savedDataset === 'new_guntur') {
        setSelectedDataset(savedDataset as DatasetType);
        setShowDatasetSelector(false);
      }
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
    sessionStorage.removeItem('dataset');
    setShowDatasetSelector(true);
  };

  const handleDatasetSelect = (dataset: DatasetType) => {
    setSelectedDataset(dataset);
    sessionStorage.setItem('dataset', dataset);
    setShowDatasetSelector(false);
  };

  const handleBackToSelection = () => {
    setShowDatasetSelector(true);
    sessionStorage.removeItem('dataset');
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Show dataset selector after login
  if (showDatasetSelector) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white'
      }}>
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          padding: '40px', 
          borderRadius: '12px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          textAlign: 'center',
          maxWidth: '500px'
        }}>
          <h2 style={{ marginBottom: '10px', fontSize: '24px' }}>Select Dataset</h2>
          <p style={{ marginBottom: '30px', opacity: 0.9, fontSize: '14px' }}>
            Choose which image dataset you want to work with
          </p>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleDatasetSelect('existing')}
              style={{
                padding: '20px 40px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                transition: 'all 0.3s',
                minWidth: '180px'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              📁 Existing Dataset
            </button>
            <button
              onClick={() => handleDatasetSelect('ptz')}
              style={{
                padding: '20px 40px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                transition: 'all 0.3s',
                minWidth: '180px'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              📹 PTZ Dataset
            </button>
            <button
              onClick={() => handleDatasetSelect('new_guntur')}
              style={{
                padding: '20px 40px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                transition: 'all 0.3s',
                minWidth: '180px'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              🏙️ New Guntur
            </button>
          </div>
          <button
            onClick={handleLogout}
            style={{
              marginTop: '30px',
              padding: '12px 24px',
              background: 'rgba(255, 0, 0, 0.2)',
              border: '2px solid rgba(255, 0, 0, 0.4)',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.3s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 0, 0, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 0, 0, 0.2)';
            }}
          >
            🚪 Logout
          </button>
        </div>
      </div>
    );
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
      </div>
      <ImageViewer dataset={selectedDataset} onBack={handleBackToSelection} />
    </div>
  );
}

export default App
