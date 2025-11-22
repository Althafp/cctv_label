// Script to create empty analytics JSON file for a dataset
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUCKET_NAME = 'image_labeling';

// Get dataset from command line argument
const dataset = process.argv[2] || 'ptz';
const DATA_FOLDER = dataset === 'ptz' ? 'analytics-data-ptz' : 'analytics-data';
const DATA_FILE = 'image_analytics_data.json';

// Initialize GCS
const initGCS = () => {
  try {
    const keyFile = path.join(__dirname, '../../gcs-key.json');
    let storageConfig = {
      projectId: 'focus-cumulus-477711-g5',
    };
    
    if (fs.existsSync(keyFile)) {
      storageConfig.keyFilename = keyFile;
      console.log('Using GCS key file');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      storageConfig.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      console.log('Using GOOGLE_APPLICATION_CREDENTIALS_JSON from env');
    } else {
      console.error('GCS credentials not found');
      process.exit(1);
    }
    
    return new Storage(storageConfig);
  } catch (error) {
    console.error('Failed to initialize GCS:', error);
    process.exit(1);
  }
};

async function createEmptyFile() {
  try {
    const storage = initGCS();
    const bucket = storage.bucket(BUCKET_NAME);
    const filePath = `${DATA_FOLDER}/${DATA_FILE}`;
    const file = bucket.file(filePath);
    
    // Check if file already exists
    const [exists] = await file.exists();
    if (exists) {
      console.log(`⚠️ File already exists: gs://${BUCKET_NAME}/${filePath}`);
      console.log('Skipping creation. File is ready to use.');
      return;
    }
    
    // Create empty array JSON
    const emptyData = [];
    const jsonContent = JSON.stringify(emptyData, null, 2);
    
    // Upload empty file
    await file.save(jsonContent, {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'no-cache',
      },
    });
    
    console.log(`✅ Created empty analytics file: gs://${BUCKET_NAME}/${filePath}`);
    console.log(`📊 Dataset: ${dataset}`);
    console.log(`📁 Folder: ${DATA_FOLDER}`);
  } catch (error) {
    console.error('❌ Error creating file:', error);
    process.exit(1);
  }
}

// Run
createEmptyFile();

