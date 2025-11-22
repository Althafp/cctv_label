import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveToGCS, loadFromGCS, getFallbackPath } from './gcs-storage.js';

const ANALYTICS_OPTIONS = [
  'Abandoned Object',
  'Crowd Detection',
  'Intrusion Detection',
  'No Parking',
  'Loitering',
  'Garbage Detection',
  'Accident',
  'Wrong Way',
  'Congestion Detection',
  'Pot Hole'
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try GCS first, then fallback to file system
// ALWAYS loads fresh data - no caching
// Returns { data, generation } or null
const loadData = async (dataset = 'existing') => {
  // ALWAYS try GCS first - get fresh data every time
  const gcsResult = await loadFromGCS(dataset);
  if (gcsResult && gcsResult.data) {
    console.log(`Loaded fresh data from GCS: ${gcsResult.data.length} items, generation: ${gcsResult.generation}`);
    return gcsResult;
  }

  // Fallback to file system (no generation tracking for local files)
  try {
    const dataPath = getFallbackPath(dataset);
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf8');
      const data = JSON.parse(content);
      console.log(`Loaded fresh data from file: ${data.length} items`);
      return { data, generation: null }; // No generation for local files
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

const saveData = async (data, isPartialUpdate = false, dataset = 'existing', maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let dataToSave = data;
      let expectedGeneration = null;
      
      // If partial update, merge with existing data
      if (isPartialUpdate && Array.isArray(data) && data.length > 0) {
        // CRITICAL: ALWAYS load fresh data from GCS before merging
        // Never use cached data - this prevents data loss from concurrent saves
        const freshResult = await loadData(dataset);
        
        if (freshResult && freshResult.data && Array.isArray(freshResult.data) && freshResult.data.length > 0) {
          // Merge new data with fresh existing data
          dataToSave = mergeData(freshResult.data, data);
          expectedGeneration = freshResult.generation; // Store generation for conflict detection
          console.log(`✅ Merging ${data.length} image(s) into existing ${freshResult.data.length} images from GCS (attempt ${attempt}/${maxRetries})`);
        } else {
          // No existing data, use new data as-is
          console.log(`ℹ️ No existing data in GCS, saving ${data.length} new image(s)`);
          dataToSave = data;
        }
      }
      
      // Validate data before saving
      if (!dataToSave || !Array.isArray(dataToSave) || dataToSave.length === 0) {
        console.warn('⚠️ Attempted to save empty or invalid data, skipping');
        return false;
      }
      
      console.log(`💾 Attempting to save ${dataToSave.length} items to GCS...`);
      
      // Try GCS first with generation check (optimistic locking)
      const gcsResult = await saveToGCS(dataToSave, dataset, expectedGeneration);
      
      // Check if save succeeded
      if (gcsResult === true) {
        console.log(`✅ Successfully saved ${dataToSave.length} items to GCS`);
        return true;
      }
      
      // Check if there was a conflict (concurrent modification)
      if (gcsResult && gcsResult.conflict) {
        if (attempt < maxRetries) {
          console.log(`⚠️ Concurrent modification detected, retrying... (attempt ${attempt + 1}/${maxRetries})`);
          // Wait a bit before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue; // Retry the loop
        } else {
          console.error('❌ Max retries reached due to concurrent modifications');
          return false;
        }
      }
      
      // Other error, don't retry
      break;

    console.warn('⚠️ GCS save failed, trying fallback');
    
    // Fallback to file system (only works locally, not in Vercel)
    if (!process.env.VERCEL) {
      try {
        const dataPath = getFallbackPath(dataset);
        const dir = path.dirname(dataPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dataPath, JSON.stringify(dataToSave, null, 2), 'utf8');
        console.log(`✅ Saved ${dataToSave.length} items to fallback file system`);
        return true;
      } catch (error) {
        console.error('❌ Error saving data to file:', error);
        return false;
      }
    }
    
      console.error('❌ GCS save failed and no fallback available in Vercel');
      return false;
    } catch (error) {
      console.error(`❌ Error in saveData function (attempt ${attempt}/${maxRetries}):`, error);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }
      console.error('Error stack:', error?.stack);
      return false;
    }
  }
  
  return false;
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

  // Get dataset from query parameter
  const dataset = req.query?.dataset === 'ptz' ? 'ptz' : 'existing';

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
    
    console.log('📤 Processing save: isPartialUpdate=', isPartialUpdate, 'data items=', data.length);
    
    // Don't cache dataStore - always load fresh in saveData function
    // This prevents race conditions and data loss from concurrent saves
    const success = await saveData(data, isPartialUpdate, dataset);
    
    if (success) {
      // Verify save by reloading the saved item(s) from GCS
      if (isPartialUpdate && data.length > 0 && data.length <= 5) {
        // Only verify for small saves (1-5 items) to avoid performance issues
        try {
          const savedFilename = data[0]?.filename;
          if (savedFilename) {
            const verifyData = await loadData(dataset);
            const verified = verifyData?.find(item => item.filename === savedFilename);
            if (verified) {
              const savedAnalytics = ANALYTICS_OPTIONS.filter(opt => verified[opt] === 'yes');
              console.log(`✅ Verified save for ${savedFilename}: ${savedAnalytics.length} analytics`);
            } else {
              console.warn(`⚠️ Could not verify save for ${savedFilename}`);
            }
          }
        } catch (verifyError) {
          console.warn('Verification check failed (non-critical):', verifyError.message);
        }
      }
      
      res.status(200).json({ 
        success: true, 
        message: isPartialUpdate ? 'Image data merged successfully' : 'Data saved successfully',
        storage: 'GCS',
        note: 'Data stored in Google Cloud Storage',
        merged: isPartialUpdate,
        imagesUpdated: data.length
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to save data to GCS' 
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

