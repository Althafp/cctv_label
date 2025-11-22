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

// Merge new data with existing data by filename
const mergeData = (existingData, newData) => {
  if (!existingData || !Array.isArray(existingData)) {
    return Array.isArray(newData) ? newData : [];
  }
  
  if (!newData || !Array.isArray(newData) || newData.length === 0) {
    return existingData;
  }

  // Create a map of new data by filename for quick lookup
  const newDataMap = new Map(newData.map(item => [item.filename, item]));
  
  // Update existing data with new data, preserving order
  const merged = existingData.map(item => {
    const updated = newDataMap.get(item.filename);
    if (updated) {
      // Remove from map so we know which new items are additions
      newDataMap.delete(item.filename);
      return updated;
    }
    return item;
  });
  
  // Add any new items that weren't in existing data
  newDataMap.forEach(newItem => {
    merged.push(newItem);
  });
  
  // Recalculate S.No for all items
  return merged.map((item, index) => ({
    ...item,
    'S.No': index + 1
  }));
};

// Save image analytics data
app.post('/api/save-analytics', async (req, res) => {
  try {
    // Handle both old format (array) and new format (object with isPartialUpdate and data)
    let data = req.body;
    let isPartialUpdate = false;
    
    // Check if body is an object with isPartialUpdate and data properties (new format)
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      if ('isPartialUpdate' in req.body && 'data' in req.body) {
        isPartialUpdate = req.body.isPartialUpdate === true;
        data = req.body.data;
      } else if (Array.isArray(req.body)) {
        // It's actually an array, not an object
        data = req.body;
        isPartialUpdate = data.length < 100; // Heuristic
      } else {
        // Try to extract array from object
        const arrayKey = Object.keys(req.body).find(key => Array.isArray(req.body[key]) && key !== 'isPartialUpdate');
        if (arrayKey) {
          data = req.body[arrayKey];
          isPartialUpdate = req.body.isPartialUpdate === true || data.length < 100;
        }
      }
    } else if (Array.isArray(req.body)) {
      // Old format - just an array
      data = req.body;
      isPartialUpdate = data.length < 100; // Heuristic: < 100 items is likely partial
    }
    
    // Validate input
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid data format. Expected array.' 
      });
    }
    
    // Prevent saving empty arrays
    if (data.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot save empty data. Data corruption prevented.' 
      });
    }
    
    let dataToSave = data;
    
    // If partial update, merge with existing data
    if (isPartialUpdate) {
      // Load existing data from GCS or local
      let existingData = await loadFromGCS();
      if (!existingData) {
        const filePath = getFallbackPath();
        if (fs.existsSync(filePath)) {
          existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      }
      
      if (existingData) {
        dataToSave = mergeData(existingData, data);
        console.log(`Merging ${data.length} image(s) into existing ${existingData.length} images`);
      }
    }
    
    // Try GCS first
    const gcsSuccess = await saveToGCS(dataToSave);
    
    if (gcsSuccess) {
      console.log('Saved analytics data to GCS');
      return res.json({ 
        success: true, 
        message: isPartialUpdate ? 'Image data merged successfully' : 'Data saved successfully to GCS',
        storage: 'GCS',
        merged: isPartialUpdate,
        imagesUpdated: data.length
      });
    }
    
    // Fallback to local file
    const filePath = getFallbackPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
    console.log(`Saved analytics data to ${filePath} (fallback)`);
    res.json({ 
      success: true, 
      message: 'Data saved successfully', 
      path: filePath, 
      storage: 'local',
      merged: isPartialUpdate,
      imagesUpdated: data.length
    });
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

