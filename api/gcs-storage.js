// GCS Storage utility for saving/loading analytics data
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUCKET_NAME = 'image_labeling';
const DATA_FOLDER = 'analytics-data';
const DATA_FILE = 'image_analytics_data.json';

// Initialize GCS client
let storage = null;
let bucket = null;

const initGCS = () => {
  if (storage) return; // Already initialized
  
  try {
    const keyFile = path.join(__dirname, '../../gcs-key.json'); // Outside react-app folder
    
    let storageConfig = {
      projectId: 'focus-cumulus-477711-g5',
    };
    
    // Use key file if exists, otherwise try env vars
    if (fs.existsSync(keyFile)) {
      storageConfig.keyFilename = keyFile;
      console.log('Using GCS key file');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      // Use JSON from environment variable (for Vercel)
      try {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        storageConfig.credentials = credentials;
        console.log('Using GOOGLE_APPLICATION_CREDENTIALS_JSON from env');
      } catch (parseError) {
        console.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', parseError.message);
        console.error('Env var exists:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        return;
      }
    } else {
      console.error('GCS key file not found and no GOOGLE_APPLICATION_CREDENTIALS_JSON env var');
      console.error('Current env vars:', Object.keys(process.env).filter(k => k.includes('GOOGLE')));
      return;
    }
    
    storage = new Storage(storageConfig);
    bucket = storage.bucket(BUCKET_NAME);
    console.log('GCS initialized successfully');
  } catch (error) {
    console.error('Failed to initialize GCS:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
    storage = null;
    bucket = null;
  }
};

// Save data to GCS
export const saveToGCS = async (data) => {
  try {
    initGCS();
    if (!bucket) {
      console.warn('GCS not initialized, using fallback');
      return false;
    }

    const filePath = `${DATA_FOLDER}/${DATA_FILE}`;
    const file = bucket.file(filePath);
    
    // Save the file - GCS will automatically "create" the folder path
    await file.save(JSON.stringify(data, null, 2), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'no-cache',
      },
    });

    console.log(`✅ Saved analytics data to gs://${BUCKET_NAME}/${filePath}`);
    return true;
  } catch (error) {
    console.error('Error saving to GCS:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
    return false;
  }
};

// Load data from GCS
export const loadFromGCS = async () => {
  try {
    initGCS();
    if (!bucket) {
      console.warn('GCS not initialized, using fallback');
      return null;
    }

    const filePath = `${DATA_FOLDER}/${DATA_FILE}`;
    const file = bucket.file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      // Don't log this on every request - it's normal on first load
      return null;
    }

    // Download with no cache to ensure fresh data
    const [contents] = await file.download({
      validation: false // Skip validation for faster download
    });
    const data = JSON.parse(contents.toString('utf8'));
    
    console.log(`✅ Loaded analytics data from gs://${BUCKET_NAME}/${filePath} (${data?.length || 0} items)`);
    return data;
  } catch (error) {
    console.error('Error loading from GCS:', error.message);
    return null;
  }
};

// Fallback to /tmp for Vercel if GCS fails
export const getFallbackPath = () => {
  const tmpPath = '/tmp/image_analytics_data.json';
  const localPath = path.join(__dirname, '../data/image_analytics_data.json');
  return process.env.VERCEL ? tmpPath : localPath;
};

