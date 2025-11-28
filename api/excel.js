import fs from 'fs';
import XLSX from 'xlsx';
import { loadFromGCS, getFallbackPath } from './gcs-storage.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get dataset from query parameter (default to existing)
    const dataset = req.query?.dataset === 'ptz' ? 'ptz' : 
                    req.query?.dataset === 'new_guntur' ? 'new_guntur' : 'existing';
    
    // Try GCS first
    const gcsResult = await loadFromGCS(dataset);
    let jsonData = gcsResult ? (gcsResult.data || gcsResult) : null;
    
    // Fallback to file system
    if (!jsonData) {
      const filePath = getFallbackPath(dataset);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'No data file found. Please save some analytics data first.' });
      }
      jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      return res.status(404).json({ error: 'No data available to export.' });
    }
    
    // Convert JSON to Excel
    const worksheet = XLSX.utils.json_to_sheet(jsonData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Image Analytics');
    
    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for file download
    const filename = `image_analytics_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Send the file
    res.send(excelBuffer);
    
    console.log(`Excel file downloaded: ${filename} (${jsonData.length} rows)`);
  } catch (error) {
    console.error('Error generating Excel file:', error);
    res.status(500).json({ error: 'Failed to generate Excel file', message: error.message });
  }
}

