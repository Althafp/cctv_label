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

const saveData = async (data, isPartialUpdate = false) => {
  try {
    let dataToSave = data;
    
    // If partial update, merge with existing data
    if (isPartialUpdate && Array.isArray(data) && data.length > 0) {
      // Load existing data
      if (!dataStore) {
        dataStore = await loadData();
      }
      
      // Merge new data with existing
      dataToSave = mergeData(dataStore, data);
      console.log(`Merging ${data.length} image(s) into existing ${dataStore?.length || 0} images`);
    }
    
    // Validate data before saving
    if (!dataToSave || !Array.isArray(dataToSave) || dataToSave.length === 0) {
      console.warn('Attempted to save empty or invalid data, skipping');
      return false;
    }
    
    console.log('Attempting to save to GCS, data length:', dataToSave.length);
    
    // Try GCS first
    const gcsSuccess = await saveToGCS(dataToSave);
    if (gcsSuccess) {
      dataStore = dataToSave;
      console.log('Successfully saved to GCS');
      return true;
    }

    console.warn('GCS save failed, trying fallback');
    
    // Fallback to file system (only works locally, not in Vercel)
    if (!process.env.VERCEL) {
      try {
        const dataPath = getFallbackPath();
        const dir = path.dirname(dataPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dataPath, JSON.stringify(dataToSave, null, 2), 'utf8');
        dataStore = dataToSave;
        console.log('Saved to fallback file system');
        return true;
      } catch (error) {
        console.error('Error saving data to file:', error);
        return false;
      }
    }
    
    console.error('GCS save failed and no fallback available in Vercel');
    return false;
  } catch (error) {
    console.error('Error in saveData function:', error);
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
    console.log('Received save request, method:', req.method);
    console.log('Request body type:', typeof req.body, 'isArray:', Array.isArray(req.body));
    
    // Handle both old format (array) and new format (object with isPartialUpdate and data)
    let data = req.body;
    let isPartialUpdate = false;
    
    // Check if body is an object with isPartialUpdate and data properties (new format)
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      if ('isPartialUpdate' in req.body && 'data' in req.body && Array.isArray(req.body.data)) {
        isPartialUpdate = req.body.isPartialUpdate === true;
        data = req.body.data;
        console.log('Using new format: isPartialUpdate=', isPartialUpdate, 'data length=', data.length);
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
          console.log('Extracted data from key:', arrayKey, 'length=', data?.length);
        } else {
          console.error('Could not find array in request body. Keys:', Object.keys(req.body || {}));
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid data format. Expected array or object with data array.' 
          });
        }
      }
    } else if (Array.isArray(req.body)) {
      // Old format - just an array
      data = req.body;
      isPartialUpdate = data.length < 100; // Heuristic: < 100 items is likely partial
      console.log('Using old format (array), length=', data.length);
    } else {
      console.error('Invalid request body type:', typeof req.body);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request body. Expected array or object.' 
      });
    }
    
    // Validate input
    if (!data || !Array.isArray(data)) {
      console.error('Data is not an array:', typeof data);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid data format. Expected array.' 
      });
    }
    
    // Prevent saving empty arrays (unless it's explicitly a partial update of 0 items)
    if (data.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot save empty data. Data corruption prevented.' 
      });
    }
    
    console.log('Processing save: isPartialUpdate=', isPartialUpdate, 'data items=', data.length);
    
    // Load existing data first
    if (!dataStore) {
      dataStore = await loadData();
      console.log('Loaded existing data:', dataStore?.length || 0, 'items');
    }
    
    const success = await saveData(data, isPartialUpdate);
    
    if (success) {
      res.status(200).json({ 
        success: true, 
        message: isPartialUpdate ? 'Image data merged successfully' : 'Data saved successfully',
        storage: success ? 'GCS' : 'fallback',
        note: success ? 'Data stored in Google Cloud Storage' : 'Data stored in temporary storage',
        merged: isPartialUpdate,
        imagesUpdated: data.length
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to save data' 
      });
    }
  } catch (error) {
    console.error('Error saving analytics:', error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
    console.error('Error details:', {
      message: errorMessage,
      stack: error?.stack,
      body: req.body
    });
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}

