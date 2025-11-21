import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GCS Configuration
const BUCKET_NAME = 'image_labeling';
const FOLDER_NAME = 'images'; // Folder inside the bucket
const KEY_FILE = path.join(__dirname, '../gcs-key.json');
const IMAGES_FOLDER = path.join(__dirname, '../FIXED_20_11_2025');

// Initialize GCS client
const storage = new Storage({
  keyFilename: KEY_FILE,
  projectId: 'focus-cumulus-477711-g5',
});

const bucket = storage.bucket(BUCKET_NAME);

async function uploadImages() {
  try {
    // Check if bucket exists, create if not
    const [exists] = await bucket.exists();
    if (!exists) {
      console.log(`Creating bucket: ${BUCKET_NAME}...`);
      try {
        await bucket.create({
          location: 'us-central1',
          storageClass: 'STANDARD',
        });
        console.log(`✅ Bucket ${BUCKET_NAME} created successfully.`);
      } catch (error) {
        if (error.code === 409) {
          console.log(`Bucket ${BUCKET_NAME} already exists.`);
        } else {
          throw error;
        }
      }
    } else {
      console.log(`✅ Bucket ${BUCKET_NAME} exists.`);
    }

    // Try to make bucket publicly readable
    // Note: If uniform bucket-level access is enabled, use IAM instead
    try {
      await bucket.makePublic();
      console.log('Bucket set to public access via ACL.');
    } catch (error) {
      if (error.message.includes('uniform bucket-level access')) {
        console.log('⚠️  Uniform bucket-level access is enabled.');
        console.log('   To make images public, use IAM:');
        console.log(`   gsutil iam ch allUsers:objectViewer gs://${BUCKET_NAME}`);
        console.log('   Or set bucket policy in Google Cloud Console.');
      } else {
        throw error;
      }
    }

    // Read images from local folder
    const files = fs.readdirSync(IMAGES_FOLDER);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|JPG|JPEG|PNG)$/i.test(file)
    );

    console.log(`Found ${imageFiles.length} images to upload...`);
    console.log(`Uploading to: gs://${BUCKET_NAME}/${FOLDER_NAME}/`);

    let uploaded = 0;
    let failed = 0;
    const manifest = {
      images: [],
      gcsBaseUrl: `https://storage.googleapis.com/${BUCKET_NAME}/${FOLDER_NAME}`,
    };

    // Upload images in batches to avoid overwhelming the API
    const BATCH_SIZE = 10;
    for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
      const batch = imageFiles.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (filename) => {
        try {
          const localPath = path.join(IMAGES_FOLDER, filename);
          const gcsPath = `${FOLDER_NAME}/${filename}`;
          
          // Check if file already exists in GCS
          const file = bucket.file(gcsPath);
          const [exists] = await file.exists();
          
          if (exists) {
            console.log(`⏭️  Skipping ${filename} (already exists)`);
            uploaded++;
          } else {
            // Upload file
            await bucket.upload(localPath, {
              destination: gcsPath,
              metadata: {
                cacheControl: 'public, max-age=31536000',
                contentType: getContentType(filename),
              },
            });
            
            console.log(`✅ Uploaded ${filename} (${uploaded + failed + 1}/${imageFiles.length})`);
            uploaded++;
          }
          
          // Add to manifest
          const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${FOLDER_NAME}/${filename}`;
          manifest.images.push({
            filename,
            path: publicUrl,
            gcsPath: gcsPath,
          });
        } catch (error) {
          console.error(`❌ Failed to upload ${filename}:`, error.message);
          failed++;
        }
      }));
    }

    // Save manifest with GCS URLs
    const manifestPath = path.join(__dirname, '../public/image-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
    console.log('\n📊 Upload Summary:');
    console.log(`✅ Successfully uploaded: ${uploaded}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📄 Manifest saved to: ${manifestPath}`);
    console.log(`\n🌐 Images are now available at: https://storage.googleapis.com/${BUCKET_NAME}/${FOLDER_NAME}/`);
    
  } catch (error) {
    console.error('Error uploading to GCS:', error);
    process.exit(1);
  }
}

function getContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const types = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
  };
  return types[ext] || 'image/jpeg';
}

// Run upload
uploadImages();

