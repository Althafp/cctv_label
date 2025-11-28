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
  // Additional fields for new_guntur format
  'POLE NO.': string;
  'REF': string;
  'POLICE STATION NAME': string;
  'Additional/New Analytics required': string;
  'Remarks if any': string;
}

/**
 * Normalizes Excel row data to standard CameraData format
 * Handles both old format (all_cams.xlsx) and new format (new_guntur.xlsx)
 */
function normalizeExcelRow(row: any): CameraData {
  // Check if it's new_guntur format - look for key indicators
  const rowKeys = Object.keys(row);
  const hasIPColumn = rowKeys.some(key => 
    key.trim().toUpperCase() === 'I.P' || 
    key.trim().toUpperCase() === 'I.P.' ||
    key.trim() === 'I.P' ||
    key.trim() === 'I.P.'
  );
  const hasLocationName = rowKeys.some(key => 
    key.trim().toUpperCase() === 'LOCATIONNAME' ||
    key.trim() === 'LOCATIONNAME'
  );
  const isNewGunturFormat = hasIPColumn || hasLocationName;
  
  // Helper to get value by trying multiple key variations
  const getValue = (keys: string[], defaultValue: string = '') => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
        return String(row[key]).trim();
      }
    }
    return defaultValue;
  };
  
  if (isNewGunturFormat) {
    // Map new_guntur format to standard format
    const ipValue = getValue(['I.P', 'I.P.', 'CAMERA IP'], '');
    
    return {
      'S.No': getValue(['S.No.', 'S.No', 'S.No']),
      'Old DISTRICT': getValue(['Old DISTRICT'], ''),
      'NEW DISTRICT': getValue(['NEW DISTRICT'], ''),
      'MANDAL': getValue(['MANDAL'], ''),
      'Location Name': getValue(['LOCATIONNAME', 'Location Name'], ''),
      'LATITUDE': getValue(['LATITUDE'], ''),
      'LONGITUDE': getValue(['LONGITUDE'], ''),
      'CAMERA IP': ipValue,
      'TYPE OF CAMERA': getValue(['Type of Camera', 'TYPE OF CAMERA'], ''),
      'TYPE OF Analytics': getValue(['Analytics Existed/Newly proposed', 'TYPE OF Analytics'], ''),
      'POLE NO.': getValue(['POLE NO.', 'POLE NO'], ''),
      'REF': getValue(['REF'], ''),
      'POLICE STATION NAME': getValue(['POLICE STATION NAME'], ''),
      'Additional/New Analytics required': getValue(['Additional/New Analytics required'], ''),
      'Remarks if any': getValue(['Remarks if any'], ''),
    };
  } else {
    // Old format - return as-is (already in standard format)
    return {
      'S.No': row['S.No'] || '',
      'Old DISTRICT': row['Old DISTRICT'] || '',
      'NEW DISTRICT': row['NEW DISTRICT'] || '',
      'MANDAL': row['MANDAL'] || '',
      'Location Name': row['Location Name'] || '',
      'LATITUDE': row['LATITUDE'] || '',
      'LONGITUDE': row['LONGITUDE'] || '',
      'CAMERA IP': row['CAMERA IP'] || '',
      'TYPE OF CAMERA': row['TYPE OF CAMERA'] || '',
      'TYPE OF Analytics': row['TYPE OF Analytics'] || '',
      'POLE NO.': '',
      'REF': '',
      'POLICE STATION NAME': '',
      'Additional/New Analytics required': '',
      'Remarks if any': '',
    };
  }
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
    
    // Convert to JSON (raw data)
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);
    console.log(`Loaded ${rawData.length} rows from Excel`);
    
    // Normalize all rows to standard format
    const normalizedData: CameraData[] = rawData.map(normalizeExcelRow);
    
    // Create map by IP address - try multiple IP formats
    const ipMap = new Map<string, CameraData>();
    let ipCount = 0;
    
    normalizedData.forEach((row, index) => {
      const ip = String(row['CAMERA IP'] || '').trim();
      if (ip) {
        // Normalize IP: remove all spaces, ensure proper format
        const normalized = ip.replace(/\s+/g, '').trim();
        
        // Store with normalized IP (primary key)
        ipMap.set(normalized, row);
        
        // Also store with original IP if different
        if (normalized !== ip) {
          ipMap.set(ip, row);
        }
        
        // Store with different formats (dots vs underscores) for matching flexibility
        const ipWithDots = normalized.replace(/_/g, '.');
        if (ipWithDots !== normalized) {
          ipMap.set(ipWithDots, row);
        }
        
        const ipWithUnderscores = normalized.replace(/\./g, '_');
        if (ipWithUnderscores !== normalized) {
          ipMap.set(ipWithUnderscores, row);
        }
        
        // Also store without leading zeros in each octet (e.g., 10.246.0.166 = 10.246.0.166)
        // This handles cases where Excel might have "010.246.000.166"
        try {
          const octets = normalized.split(/[._]/);
          if (octets.length === 4) {
            const normalizedOctets = octets.map(oct => String(parseInt(oct, 10)));
            const normalizedIP = normalizedOctets.join('.');
            if (normalizedIP !== normalized) {
              ipMap.set(normalizedIP, row);
            }
          }
        } catch (e) {
          // Ignore parsing errors
        }
        
        ipCount++;
        
        // Log first few IPs for debugging
        if (index < 10) {
          console.log(`Excel IP [${index}]: "${ip}" -> normalized: "${normalized}"`);
        }
      } else if (index < 10) {
        // Log rows without IP for debugging
        console.warn(`Row ${index} has no IP address. CAMERA IP value:`, row['CAMERA IP']);
        console.warn(`  Available keys:`, Object.keys(row));
        console.warn(`  Raw row sample:`, Object.fromEntries(Object.entries(row).slice(0, 5)));
      }
    });
    
    console.log(`Created IP map with ${ipMap.size} entries (${ipCount} unique IPs)`);
    
    // Log all unique IPs for debugging (first 20)
    if (ipCount > 0) {
      const uniqueIPs = Array.from(new Set(normalizedData
        .map(row => String(row['CAMERA IP'] || '').trim())
        .filter(ip => ip !== '')))
        .slice(0, 20);
      console.log(`Sample IPs from Excel (first 20):`, uniqueIPs);
    }
    
    return ipMap;
  } catch (error) {
    console.error('Error loading Excel file:', error);
    return new Map();
  }
}

