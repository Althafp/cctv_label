import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveToGCS, loadFromGCS, getFallbackPath } from './gcs-storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dataStore = null;

// Try GCS first, then fallback to file system
const loadData = async () => {
  // Try GCS first
  const gcsData = await loadFromGCS();
  if (gcsData) {
    return gcsData;
  }

  // Fallback to file system
  try {
    const dataPath = getFallbackPath();
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error loading data from file:', error);
  }
  return null;
};

const saveData = async (data) => {
  // Try GCS first
  const gcsSuccess = await saveToGCS(data);
  if (gcsSuccess) {
    dataStore = data;
    return true;
  }

  // Fallback to file system
  try {
    const dataPath = getFallbackPath();
    const dir = path.dirname(dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    dataStore = data;
    return true;
  } catch (error) {
    console.error('Error saving data to file:', error);
    dataStore = data;
    return false;
  }
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;
    
    // Load existing data first
    if (!dataStore) {
      dataStore = await loadData();
    }
    
    const success = await saveData(data);
    
    res.status(200).json({ 
      success: true, 
      message: 'Data saved successfully',
      storage: success ? 'GCS' : 'fallback',
      note: success ? 'Data stored in Google Cloud Storage' : 'Data stored in temporary storage'
    });
  } catch (error) {
    console.error('Error saving analytics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

