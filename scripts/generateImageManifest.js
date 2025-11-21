import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesFolder = path.join(__dirname, '../FIXED_20_11_2025');
const outputFile = path.join(__dirname, '../public/image-manifest.json');

try {
  const files = fs.readdirSync(imagesFolder);
  const imageFiles = files.filter(file => 
    /\.(jpg|jpeg|png|JPG|JPEG|PNG)$/i.test(file)
  );
  
  const manifest = {
    images: imageFiles.map(filename => ({
      filename,
      path: `/FIXED_20_11_2025/${filename}`
    }))
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
  console.log(`Generated manifest with ${imageFiles.length} images`);
} catch (error) {
  console.error('Error generating manifest:', error);
  process.exit(1);
}

