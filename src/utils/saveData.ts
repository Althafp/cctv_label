import type { ImageInfo } from '../components/ImageViewer';

const ANALYTICS_OPTIONS = [
  'Abandoned Object',
  'Crowd Detection',
  'Intrusion Detection',
  'No Parking',
  'Loitering',
  'Garbage Detection',
  'Accident',
  'Wrong Way',
  'Congestion Detection',
  'Pot Hole'
];

export interface Label {
  id: string;
  type: 'rectangle' | 'line';
  coordinates: number[]; // Normalized coordinates (0-1): [x1, y1, x2, y2]
  label?: string; // Optional label text
}

export interface SavedImageData {
  'S.No': number;
  'Old DISTRICT': string;
  'NEW DISTRICT': string;
  'MANDAL': string;
  'Location Name': string;
  'LATITUDE': string | number;
  'LONGITUDE': string | number;
  'CAMERA IP': string;
  'TYPE OF CAMERA': string;
  'TYPE OF Analytics': string;
  'Abandoned Object': 'yes' | 'no';
  'Crowd Detection': 'yes' | 'no';
  'Intrusion Detection': 'yes' | 'no';
  'No Parking': 'yes' | 'no';
  'Loitering': 'yes' | 'no';
  'Garbage Detection': 'yes' | 'no';
  'Accident': 'yes' | 'no';
  'Wrong Way': 'yes' | 'no';
  'Congestion Detection': 'yes' | 'no';
  'Pot Hole': 'yes' | 'no';
  filename: string; // Keep for reference
  ip: string | null; // Keep for reference
  labels?: Label[]; // Image labels (rectangles and lines)
  imageWidth?: number; // Original image width (for reference)
  imageHeight?: number; // Original image height (for reference)
}

/**
 * Convert ImageInfo array to saved format (Excel-ready structure)
 */
export function convertToSavedFormat(images: ImageInfo[]): SavedImageData[] {
  return images.map((img, index) => {
    // Get camera data or use defaults
    const cameraData = img.cameraData;
    
    // Build analytics columns (yes/no for each)
    const analyticsData: { [key: string]: 'yes' | 'no' } = {};
    ANALYTICS_OPTIONS.forEach(option => {
      analyticsData[option] = img.assignedAnalytics.has(option) ? 'yes' : 'no';
    });
    
    return {
      'S.No': index + 1, // Will be recalculated by backend merge
      'Old DISTRICT': cameraData ? String(cameraData['Old DISTRICT'] || '') : '',
      'NEW DISTRICT': cameraData ? String(cameraData['NEW DISTRICT'] || '') : '',
      'MANDAL': cameraData ? String(cameraData['MANDAL'] || '') : '',
      'Location Name': cameraData ? String(cameraData['Location Name'] || '') : '',
      'LATITUDE': cameraData ? (cameraData['LATITUDE'] || '') : '',
      'LONGITUDE': cameraData ? (cameraData['LONGITUDE'] || '') : '',
      'CAMERA IP': cameraData ? String(cameraData['CAMERA IP'] || '') : (img.ip || ''),
      'TYPE OF CAMERA': cameraData ? String(cameraData['TYPE OF CAMERA'] || '') : '',
      'TYPE OF Analytics': cameraData ? String(cameraData['TYPE OF Analytics'] || '') : '',
      'Abandoned Object': analyticsData['Abandoned Object'] || 'no',
      'Crowd Detection': analyticsData['Crowd Detection'] || 'no',
      'Intrusion Detection': analyticsData['Intrusion Detection'] || 'no',
      'No Parking': analyticsData['No Parking'] || 'no',
      'Loitering': analyticsData['Loitering'] || 'no',
      'Garbage Detection': analyticsData['Garbage Detection'] || 'no',
      'Accident': analyticsData['Accident'] || 'no',
      'Wrong Way': analyticsData['Wrong Way'] || 'no',
      'Congestion Detection': analyticsData['Congestion Detection'] || 'no',
      'Pot Hole': analyticsData['Pot Hole'] || 'no',
      filename: img.filename, // Keep for reference/matching
      ip: img.ip, // Keep for reference
      labels: img.labels || [], // Image labels
      imageWidth: img.imageWidth, // Original image dimensions
      imageHeight: img.imageHeight,
    };
  });
}

/**
 * Save image data to JSON file (downloads as file) - Auto-save format
 */
export function saveImageDataToFile(images: ImageInfo[]): void {
  const savedData = convertToSavedFormat(images);
  const jsonString = JSON.stringify(savedData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `image_analytics_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Load saved image data from JSON file
 */
export function loadImageDataFromFile(file: File): Promise<SavedImageData[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as SavedImageData[];
        resolve(data);
      } catch (error) {
        reject(new Error('Failed to parse JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Save queue to batch rapid saves and prevent data loss
interface QueuedSave {
  images: ImageInfo[];
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
  dataset: 'existing' | 'ptz' | 'new_guntur';
}

let saveQueue: QueuedSave[] = [];
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let isSaving = false;
const SAVE_DEBOUNCE_MS = 500; // Wait 500ms to batch multiple saves
const MAX_QUEUE_SIZE = 10; // Process immediately if queue gets this large

/**
 * Process the save queue - batches all pending saves into one request
 */
async function processSaveQueue(): Promise<void> {
  if (isSaving || saveQueue.length === 0) {
    return;
  }

  isSaving = true;
  const queueToProcess = [...saveQueue];
  saveQueue = [];
  saveTimeout = null;

  // Get dataset from first item (all items in batch should have same dataset)
  const dataset = queueToProcess[0]?.dataset || 'existing';

  try {
    // Collect all unique images from queue (by filename, latest version wins)
    const imageMap = new Map<string, ImageInfo>();
    for (const queued of queueToProcess) {
      for (const img of queued.images) {
        imageMap.set(img.filename, img); // Latest version overwrites
      }
    }

    const allImages = Array.from(imageMap.values());
    console.log(`📦 Processing save queue: ${allImages.length} unique image(s) from ${queueToProcess.length} save request(s) [dataset: ${dataset}]`);

    const savedData = convertToSavedFormat(allImages);
    
    // Send as partial update (always merge with existing data)
    const payload = { isPartialUpdate: true, data: savedData };
    
    const response = await fetch(`/api/save-analytics?dataset=${dataset}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Saved ${allImages.length} image(s) to GCS: ${result.storage || 'GCS'}${result.merged ? ' (merged)' : ''}`);
      
      // Resolve all queued promises with success
      queueToProcess.forEach(queued => queued.resolve(true));
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error || 'Unknown error';
      console.error('❌ Failed to save to GCS:', errorMsg);
      
      // Reject all queued promises
      const error = new Error(errorMsg);
      queueToProcess.forEach(queued => queued.reject(error));
    }
  } catch (error) {
    console.error('❌ Error saving to GCS:', error);
    const saveError = error instanceof Error ? error : new Error('Unknown error');
    queueToProcess.forEach(queued => queued.reject(saveError));
  } finally {
    isSaving = false;
    
    // Process any new items that were added while we were saving
    if (saveQueue.length > 0) {
      saveTimeout = setTimeout(processSaveQueue, SAVE_DEBOUNCE_MS);
    }
  }
}

/**
 * Save single image or multiple images to GCS via backend API
 * Uses a queue to batch rapid saves and prevent data loss
 * @param images - ImageInfo array to save (can be single image or multiple)
 * @param isPartialUpdate - If true, merges with existing data instead of overwriting
 */
export async function saveToGCS(images: ImageInfo[], isPartialUpdate: boolean = true, dataset: 'existing' | 'ptz' | 'new_guntur' = 'existing'): Promise<boolean> {
  // Validate input
  if (!images || images.length === 0) {
    console.warn('⚠️ Cannot save empty images array');
    return false;
  }

  // For full updates (not partial), save immediately without queue
  if (!isPartialUpdate) {
    try {
      const savedData = convertToSavedFormat(images);
      const payload = savedData;
      
    const response = await fetch(`/api/save-analytics?dataset=${dataset}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
      
      if (response.ok) {
        // const result = await response.json();
        console.log(`✅ Saved ${images.length} image(s) to GCS (full update)`);
        return true;
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Failed to save to GCS:', errorData.error || 'Unknown error');
        return false;
      }
    } catch (error) {
      console.error('❌ Error saving to GCS:', error);
      return false;
    }
  }

  // For partial updates, use queue to batch rapid saves
  // Store dataset with each queued item
  return new Promise<boolean>((resolve, reject) => {
    saveQueue.push({ images, resolve, reject, dataset });
    
    // Count total images in queue
    const totalImagesInQueue = saveQueue.reduce((sum, q) => sum + q.images.length, 0);
    
    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    
    // Process immediately if queue is large, otherwise debounce
    if (totalImagesInQueue >= MAX_QUEUE_SIZE) {
      console.log(`📦 Queue size (${totalImagesInQueue} images) reached threshold, processing immediately`);
      processSaveQueue();
    } else {
      // Process queue after debounce delay
      saveTimeout = setTimeout(processSaveQueue, SAVE_DEBOUNCE_MS);
    }
  });
}

/**
 * Save single image to GCS (merges with existing data)
 */
export async function saveSingleImage(image: ImageInfo, dataset: 'existing' | 'ptz' | 'new_guntur' = 'existing'): Promise<boolean> {
  return saveToGCS([image], true, dataset);
}

/**
 * Save all images to GCS (full overwrite - use with caution)
 */
export function saveData(images: ImageInfo[]): void {
  saveToGCS(images, false); // Full save, not partial
}

/**
 * Load from GCS via backend API (no localStorage fallback)
 */
export async function loadFromBackend(dataset: 'existing' | 'ptz' | 'new_guntur' = 'existing'): Promise<SavedImageData[] | null> {
  try {
    // Add cache-busting to prevent browser cache from serving stale data
    const cacheBuster = `?t=${Date.now()}&dataset=${dataset}`;
    const response = await fetch(`/api/load-analytics${cacheBuster}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        console.log(`✅ Loaded from ${result.source || 'GCS'}`);
        return result.data;
      }
    }
    // No data available yet
    return null;
  } catch (error) {
    console.error('Error loading from GCS:', error);
    return null;
  }
}


