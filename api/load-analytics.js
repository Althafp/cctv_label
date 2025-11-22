import fs from 'fs';
import { loadFromGCS, getFallbackPath } from './gcs-storage.js';

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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get dataset from query parameter
  const dataset = req.query?.dataset === 'ptz' ? 'ptz' : 'existing';

  try {
    // Try GCS first - always get fresh data (no cache)
    const gcsResult = await loadFromGCS(dataset);
    if (gcsResult && gcsResult.data) {
      // Set headers to prevent browser caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.status(200).json({ success: true, data: gcsResult.data, source: 'GCS' });
    }

    // Fallback to file system
    const dataPath = getFallbackPath(dataset);
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf8');
      return res.status(200).json({ success: true, data: JSON.parse(data), source: 'file' });
    }
    
    res.status(200).json({ success: true, data: null });
  } catch (error) {
    console.error('Error loading data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

