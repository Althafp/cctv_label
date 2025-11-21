import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { saveToGCS, loadFromGCS, getFallbackPath } from './api/gcs-storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Create data directory if it doesn't exist (fallback)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Save image analytics data
app.post('/api/save-analytics', async (req, res) => {
  try {
    const data = req.body;
    
    // Try GCS first
    const gcsSuccess = await saveToGCS(data);
    
    if (gcsSuccess) {
      console.log('Saved analytics data to GCS');
      return res.json({ 
        success: true, 
        message: 'Data saved successfully to GCS',
        storage: 'GCS'
      });
    }
    
    // Fallback to local file
    const filePath = getFallbackPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Saved analytics data to ${filePath} (fallback)`);
    res.json({ success: true, message: 'Data saved successfully', path: filePath, storage: 'local' });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Load image analytics data
app.get('/api/load-analytics', async (req, res) => {
  try {
    // Try GCS first
    const gcsData = await loadFromGCS();
    if (gcsData) {
      return res.json({ success: true, data: gcsData, source: 'GCS' });
    }
    
    // Fallback to local file
    const filePath = getFallbackPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return res.json({ success: true, data: JSON.parse(data), source: 'local' });
    }
    
    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Error loading data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    // Load users from public/users.json
    const usersPath = path.join(__dirname, 'public', 'users.json');
    let users = [];
    
    if (fs.existsSync(usersPath)) {
      const usersData = fs.readFileSync(usersPath, 'utf8');
      const parsed = JSON.parse(usersData);
      users = parsed.users || [];
    }

    // Check credentials
    const user = users.find(
      u => u.username.toUpperCase() === username.toUpperCase() && u.password === password
    );

    if (user) {
      res.json({ success: true, username: user.username });
    } else {
      res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Excel download route
app.get('/excel', async (req, res) => {
  try {
    // Try GCS first
    let jsonData = await loadFromGCS();
    
    // Fallback to local file
    if (!jsonData) {
      const filePath = getFallbackPath();
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'No data file found. Please save some analytics data first.' });
      }
      jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      return res.status(404).json({ error: 'No data available to export.' });
    }
    
    // Convert JSON to Excel
    const worksheet = XLSX.utils.json_to_sheet(jsonData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Image Analytics');
    
    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for file download
    const filename = `image_analytics_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Send the file
    res.send(excelBuffer);
    
    console.log(`Excel file downloaded: ${filename} (${jsonData.length} rows)`);
  } catch (error) {
    console.error('Error generating Excel file:', error);
    res.status(500).json({ error: 'Failed to generate Excel file', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Data storage: GCS (gs://image_labeling/analytics-data/) with local fallback`);
  console.log(`Fallback path: ${getFallbackPath()}`);
  console.log(`Excel download available at: http://localhost:${PORT}/excel`);
});

