import * as XLSX from 'xlsx';

export interface CameraData {
  'S.No': number | string;
  'Old DISTRICT': string;
  'NEW DISTRICT': string;
  'MANDAL': string;
  'Location Name': string;
  'LATITUDE': number | string;
  'LONGITUDE': number | string;
  'CAMERA IP': string;
  'TYPE OF CAMERA': string;
  'TYPE OF Analytics': string;
}

/**
 * Reads Excel file and returns camera data mapped by IP address
 */
export async function loadCameraDataFromExcel(filePath: string): Promise<Map<string, CameraData>> {
  try {
    console.log(`Fetching Excel file from: ${filePath}`);
    const response = await fetch(filePath);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Excel file: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log(`Excel file size: ${arrayBuffer.byteLength} bytes`);
    
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    console.log(`Excel sheets: ${workbook.SheetNames.join(', ')}`);
    
    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data: CameraData[] = XLSX.utils.sheet_to_json(worksheet);
    console.log(`Loaded ${data.length} rows from Excel`);
    
    // Create map by IP address - try multiple IP formats
    const ipMap = new Map<string, CameraData>();
    let ipCount = 0;
    
    data.forEach((row, index) => {
      if (row['CAMERA IP']) {
        const ip = String(row['CAMERA IP']).trim();
        if (ip) {
          // Store with original IP
          ipMap.set(ip, row);
          
          // Also store normalized versions for matching
          const normalized = ip.replace(/\s+/g, '');
          if (normalized !== ip) {
            ipMap.set(normalized, row);
          }
          
          // Store with different formats (in case Excel has dots vs underscores)
          const ipWithDots = ip.replace(/_/g, '.');
          if (ipWithDots !== ip) {
            ipMap.set(ipWithDots, row);
          }
          
          const ipWithUnderscores = ip.replace(/\./g, '_');
          if (ipWithUnderscores !== ip) {
            ipMap.set(ipWithUnderscores, row);
          }
          
          ipCount++;
          
          // Log first few IPs for debugging
          if (index < 5) {
            console.log(`Sample IP from Excel [${index}]: "${ip}" -> normalized: "${normalized}"`);
          }
        }
      }
    });
    
    console.log(`Created IP map with ${ipMap.size} entries (${ipCount} unique IPs)`);
    return ipMap;
  } catch (error) {
    console.error('Error loading Excel file:', error);
    return new Map();
  }
}

