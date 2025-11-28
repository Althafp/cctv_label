import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================== CONFIG ===================
const BUCKET_NAME = 'image_labeling';

// 🔥 You requested new folder name
const FOLDER_NAME = 'new_guntur';

// 🔥 Allow dynamic folder path input
// Usage: node upload.js "D:/path/to/images"
const INPUT_FOLDER = process.argv[2];

// Fallback default folder if no CLI argument is given
const DEFAULT_FOLDER = path.join(__dirname, '../ptz_22_11_25');

const IMAGES_FOLDER = INPUT_FOLDER || DEFAULT_FOLDER;

console.log(`📁 Using local images folder: ${IMAGES_FOLDER}`);

// ================== GCS CLIENT ===============
const KEY_FILE = path.join(__dirname, '../gcs-key.json');

const storage = new Storage({
  keyFilename: KEY_FILE,
  projectId: 'focus-cumulus-477711-g5',
});

const bucket = storage.bucket(BUCKET_NAME);


// =============================================
// MAIN UPLOAD FUNCTION
// =============================================
async function uploadImages() {
  try {
    const [exists] = await bucket.exists();
    if (!exists) {
      console.log(`Creating bucket: ${BUCKET_NAME}...`);
      try {
        await bucket.create({
          location: 'us-central1',
          storageClass: 'STANDARD',
        });
        console.log(`✅ Bucket created.`);
      } catch (error) {
        if (error.code === 409) console.log(`Bucket already exists.`);
        else throw error;
      }
    } else {
      console.log(`✅ Bucket exists.`);
    }

    // Make bucket public
    try {
      await bucket.makePublic();
      console.log('🌍 Bucket is public.');
    } catch (error) {
      if (error.message.includes('uniform bucket-level access')) {
        console.log('⚠️ Uniform bucket-level access enabled.');
        console.log(`Run: gsutil iam ch allUsers:objectViewer gs://${BUCKET_NAME}`);
      } else throw error;
    }

    // Read local files
    const files = fs.readdirSync(IMAGES_FOLDER);
    const imageFiles = files.filter(file =>
      /\.(jpg|jpeg|png)$/i.test(file)
    );

    console.log(`Found ${imageFiles.length} images.`);
    console.log(`Uploading to: gs://${BUCKET_NAME}/${FOLDER_NAME}/`);

    let uploaded = 0, failed = 0;

    const manifest = {
      images: [],
      gcsBaseUrl: `https://storage.googleapis.com/${BUCKET_NAME}/${FOLDER_NAME}`,
    };

    const BATCH_SIZE = 10;
    for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
      const batch = imageFiles.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (filename) => {
        try {
          const localPath = path.join(IMAGES_FOLDER, filename);
          const gcsPath = `${FOLDER_NAME}/${filename}`;
          const file = bucket.file(gcsPath);

          const [exists] = await file.exists();
          if (exists) {
            console.log(`⏭️ Skipping ${filename} (exists)`);
            uploaded++;
          } else {
            await bucket.upload(localPath, {
              destination: gcsPath,
              metadata: {
                cacheControl: 'public, max-age=31536000',
                contentType: getContentType(filename),
              },
            });

            console.log(`✅ Uploaded ${filename}`);
            uploaded++;
          }

          manifest.images.push({
            filename,
            path: `https://storage.googleapis.com/${BUCKET_NAME}/${FOLDER_NAME}/${filename}`,
            gcsPath,
          });
        } catch (error) {
          console.log(`❌ Error uploading ${filename}:`, error.message);
          failed++;
        }
      }));
    }

    // Save manifest
    const manifestPath = path.join(__dirname, '../public/image-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log('\n📊 Upload Summary');
    console.log(`Uploaded: ${uploaded}`);
    console.log(`Failed: ${failed}`);
    console.log(`Manifest: ${manifestPath}`);
    console.log(`Images URL: https://storage.googleapis.com/${BUCKET_NAME}/${FOLDER_NAME}/`);

  } catch (error) {
    console.error('❌ Fatal Error:', error);
    process.exit(1);
  }
}

function getContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  return ext === 'png' ? 'image/png' : 'image/jpeg';
}

// Run
uploadImages();
