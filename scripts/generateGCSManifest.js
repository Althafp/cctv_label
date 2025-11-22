import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GCS Configuration
const BUCKET_NAME = 'image_labeling';
const FOLDER_NAME = 'images';
const KEY_FILE = path.join(__dirname, '../../gcs-key.json'); // Outside react-app folder
const OUTPUT_FILE = path.join(__dirname, '../public/image-manifest.json');

// Initialize GCS client
const storage = new Storage({
  keyFilename: KEY_FILE,
  projectId: 'focus-cumulus-477711-g5',
});

const bucket = storage.bucket(BUCKET_NAME);

async function generateManifest() {
  try {
    console.log(`Generating manifest from GCS bucket: ${BUCKET_NAME}/${FOLDER_NAME}...`);
    
    // Check if bucket exists
    const [exists] = await bucket.exists();
    if (!exists) {
      throw new Error(`Bucket ${BUCKET_NAME} does not exist. Please create it first or upload images.`);
    }

    // List all files in the folder
    const [files] = await bucket.getFiles({
      prefix: `${FOLDER_NAME}/`,
    });

    // Filter image files
    const imageFiles = files
      .filter(file => {
        const name = file.name.toLowerCase();
        return /\.(jpg|jpeg|png)$/i.test(name);
      })
      .map(file => {
        const filename = file.name.split('/').pop(); // Get just the filename
        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${file.name}`;
        
        return {
          filename,
          path: publicUrl,
          gcsPath: file.name,
        };
      });

    const manifest = {
      images: imageFiles,
      gcsBaseUrl: `https://storage.googleapis.com/${BUCKET_NAME}/${FOLDER_NAME}`,
      totalImages: imageFiles.length,
      generatedAt: new Date().toISOString(),
    };

    // Save manifest
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
    
    console.log(`✅ Generated manifest with ${imageFiles.length} images`);
    console.log(`📄 Manifest saved to: ${OUTPUT_FILE}`);
    console.log(`🌐 Images available at: https://storage.googleapis.com/${BUCKET_NAME}/${FOLDER_NAME}/`);
    
  } catch (error) {
    console.error('Error generating GCS manifest:', error);
    process.exit(1);
  }
}

// Run
generateManifest();

