import { useState, useEffect, useCallback } from 'react';
import { extractIPFromFilename, normalizeIP } from '../utils/imageUtils';
import { loadCameraDataFromExcel, type CameraData } from '../utils/excelUtils';
import { loadFromBackend, saveSingleImage } from '../utils/saveData';
import LabelingCanvas from './LabelingCanvas';
import ImageWithLabels from './ImageWithLabels';
import type { Label } from '../utils/saveData';
import './ImageViewer.css';

export interface ImageInfo {
  filename: string;
  path: string;
  ip: string | null;
  cameraData: CameraData | null;
  assignedAnalytics: Set<string>; // User-assigned analytics tags
  labels: Label[]; // Image labels (rectangles and lines)
  imageWidth?: number; // Original image dimensions
  imageHeight?: number;
}


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

interface ImageViewerProps {
  dataset: 'existing' | 'ptz' | 'new_guntur';
  onBack?: () => void;
}

export default function ImageViewer({ dataset, onBack }: ImageViewerProps) {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [allImages, setAllImages] = useState<ImageInfo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cameraDataMap, setCameraDataMap] = useState<Map<string, CameraData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarSelectedAnalytics, setSidebarSelectedAnalytics] = useState<Set<string>>(new Set()); // For assigning to current image
  const [labelingMode, setLabelingMode] = useState<'rectangle' | 'line' | null>(null); // null = disabled
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [navigationInput, setNavigationInput] = useState<string>('1');
  const [saving, setSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<{ message: string; type: 'success' | 'error' | null }>({ message: '', type: null });
  const [ipSearchQuery, setIpSearchQuery] = useState<string>('');
  const [ipSearchError, setIpSearchError] = useState<string>('');

  // Load Excel data first (non-blocking)
  useEffect(() => {
    async function loadData() {
      try {
        console.log('Loading Excel data...');
        // Load appropriate Excel file based on dataset
        const excelFile = dataset === 'new_guntur' ? '/new_guntur.xlsx' : '/all_cams.xlsx';
        const dataMap = await loadCameraDataFromExcel(excelFile);
        console.log(`Loaded ${dataMap.size} camera records from Excel`);
        
        // Debug: Show first few IPs from Excel
        if (dataMap.size > 0) {
          const sampleIPs = Array.from(dataMap.keys()).slice(0, 10);
          console.log('Sample IPs from Excel:', sampleIPs);
        }
        
        setCameraDataMap(dataMap);
      } catch (err) {
        console.warn('Failed to load camera data (images will still load):', err);
        // Don't set error - we can still show images without Excel data
        setCameraDataMap(new Map());
      }
    }
    
    loadData();
  }, []);

  // Keep all images visible - don't filter based on search
  // Search will only navigate to matching image
  useEffect(() => {
    setImages(allImages);
  }, [allImages]);
  
  // Get current image from filtered images
  const currentImage = images[currentIndex];
  
  // Update navigation input when current index changes
  useEffect(() => {
    setNavigationInput(String(currentIndex + 1));
  }, [currentIndex]);
  
  // Update sidebar selections to match current image's assigned analytics
  useEffect(() => {
    if (currentImage) {
      setSidebarSelectedAnalytics(new Set(currentImage.assignedAnalytics));
    } else {
      setSidebarSelectedAnalytics(new Set());
    }
  }, [currentIndex, currentImage]);

  // Preload next and previous images for faster navigation
  useEffect(() => {
    const preloadImages: HTMLImageElement[] = [];
    
    // Preload next image
    if (currentIndex < images.length - 1 && images[currentIndex + 1]) {
      const nextImg = new Image();
      nextImg.src = images[currentIndex + 1].path;
      preloadImages.push(nextImg);
    }
    
    // Preload previous image
    if (currentIndex > 0 && images[currentIndex - 1]) {
      const prevImg = new Image();
      prevImg.src = images[currentIndex - 1].path;
      preloadImages.push(prevImg);
    }
    
    return () => {
      // Cleanup if component unmounts
      preloadImages.forEach(img => { img.src = ''; });
    };
  }, [currentIndex, images]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex, images.length]);

  // Toggle analytics assignment for current image (sidebar)
  const toggleAnalyticsAssignment = (analytics: string) => {
    const currentImg = images[currentIndex];
    if (!currentImg) return;
    
    // Find the image in allImages by filename (more reliable than index)
    const updatedImages = allImages.map((img) => {
      if (img.filename === currentImg.filename) {
        const newAssigned = new Set(img.assignedAnalytics);
        if (newAssigned.has(analytics)) {
          newAssigned.delete(analytics);
        } else {
          newAssigned.add(analytics);
        }
        return { ...img, assignedAnalytics: newAssigned };
      }
      return img;
    });
    
    setAllImages(updatedImages);
    
    // Update the filtered images list too
    const updatedFilteredImages = images.map((img) => {
      if (img.filename === currentImg.filename) {
        const newAssigned = new Set(img.assignedAnalytics);
        if (newAssigned.has(analytics)) {
          newAssigned.delete(analytics);
        } else {
          newAssigned.add(analytics);
        }
        return { ...img, assignedAnalytics: newAssigned };
      }
      return img;
    });
    
    setImages(updatedFilteredImages);
    
    // Don't auto-save - user must click save button
    // This prevents data loss on refresh and race conditions
    
    // Update sidebar selection state
    setSidebarSelectedAnalytics(prev => {
      const newSet = new Set(prev);
      if (newSet.has(analytics)) {
        newSet.delete(analytics);
      } else {
        newSet.add(analytics);
      }
      return newSet;
    });
  };
  
  // Save current image independently
  const handleSaveCurrentImage = async () => {
    const currentImg = images[currentIndex];
    if (!currentImg) {
      setSaveStatus({ message: 'No image to save', type: 'error' });
      return;
    }
    
    setSaving(true);
    setSaveStatus({ message: 'Saving...', type: null });
    
    try {
      // CRITICAL: Use sidebarSelectedAnalytics as source of truth (always current)
      // allImages state might be stale due to React's async state updates
      const imageFromAllImages = allImages.find(img => img.filename === currentImg.filename) || currentImg;
      
      // Build image to save with current sidebar state (most up-to-date)
      const imageToSave: ImageInfo = {
        ...imageFromAllImages,
        assignedAnalytics: new Set(sidebarSelectedAnalytics), // Use current sidebar state
      };
      
      console.log('💾 Saving image:', imageToSave.filename);
      console.log('📊 Analytics to save:', Array.from(imageToSave.assignedAnalytics));
      console.log('📊 Analytics count:', imageToSave.assignedAnalytics.size);
      console.log('🏷️ Labels to save:', imageToSave.labels?.length || 0);
      
      // Validate we have analytics to save
      if (imageToSave.assignedAnalytics.size === 0) {
        console.warn('⚠️ No analytics selected - saving anyway to clear any existing analytics');
      }
      
      try {
        const success = await saveSingleImage(imageToSave, dataset);
        
        if (success) {
          setSaveStatus({ message: '✅ Saved successfully', type: 'success' });
          // Wait a moment, then reload data to verify it was saved
          setTimeout(async () => {
            const freshData = await loadFromBackend(dataset);
            if (freshData) {
              const saved = freshData.find(item => item.filename === imageToSave.filename);
              if (saved) {
                const savedAnalytics = ANALYTICS_OPTIONS.filter(opt => saved[opt as keyof typeof saved] === 'yes');
                console.log('✅ Verified save - Analytics in GCS:', savedAnalytics);
              } else {
                console.warn('⚠️ Saved image not found in GCS after save');
              }
            }
          }, 1500); // Increased delay to allow queue processing
          // Clear status after 4 seconds
          setTimeout(() => setSaveStatus({ message: '', type: null }), 4000);
        } else {
          setSaveStatus({ message: '❌ Failed to save - please try again', type: 'error' });
          setTimeout(() => setSaveStatus({ message: '', type: null }), 5000);
        }
      } catch (saveError) {
        const errorMsg = saveError instanceof Error ? saveError.message : 'Unknown error';
        console.error('Save error:', saveError);
        setSaveStatus({ message: `❌ Error: ${errorMsg}`, type: 'error' });
        setTimeout(() => setSaveStatus({ message: '', type: null }), 5000);
      }
    } catch (error) {
      console.error('Error saving image:', error);
      setSaveStatus({ message: '❌ Error saving', type: 'error' });
      setTimeout(() => setSaveStatus({ message: '', type: null }), 3000);
    } finally {
      setSaving(false);
    }
  };
  
  

  // Function to load images from the manifest file
  const loadImagesFromFolder = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading image manifest...');
      
      // Load image manifest based on dataset
      const manifestFile = dataset === 'ptz' ? '/image-manifest-ptz.json' : 
                          dataset === 'new_guntur' ? '/image-manifest-new-guntur.json' : 
                          '/image-manifest.json';
      const manifestResponse = await fetch(manifestFile);
      if (!manifestResponse.ok) {
        if (manifestResponse.status === 404) {
          throw new Error(`Image manifest not found: ${manifestFile}. Please generate it using: npm run generate-manifest (for new_guntur dataset)`);
        }
        throw new Error(`Failed to load image manifest: ${manifestResponse.status} ${manifestResponse.statusText}`);
      }
      
      // Check if response is actually JSON (not HTML error page)
      const contentType = manifestResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await manifestResponse.text();
        if (text.trim().startsWith('<!')) {
          throw new Error(`Image manifest not found: ${manifestFile}. The file may not exist. Please generate it first.`);
        }
        throw new Error(`Invalid response format. Expected JSON but got: ${contentType}`);
      }
      
      const manifest = await manifestResponse.json();
      console.log(`Loaded manifest with ${manifest.images?.length || 0} images`);
      
      const imageList: ImageInfo[] = [];
      
      let matchedCount = 0;
      let sampleIPs: string[] = [];
      
      for (const imageEntry of manifest.images) {
        const filename = imageEntry.filename;
        const ip = extractIPFromFilename(filename);
        
        // Debug first few extractions
        if (imageList.length < 3) {
          console.log(`[${imageList.length}] Filename: ${filename}`);
          console.log(`[${imageList.length}] Extracted IP: ${ip || 'FAILED'}`);
        }
        
        let cameraData: CameraData | null = null;
        if (ip) {
          // Normalize extracted IP
          const normalizedIP = normalizeIP(ip);
          
          // Try multiple matching strategies
          const matchAttempts = [
            normalizedIP,
            ip,
            ip.replace(/\./g, '_'),
            ip.replace(/_/g, '.'),
            // Try without leading zeros
            normalizedIP.split(/[._]/).map(oct => String(parseInt(oct, 10))).join('.'),
          ];
          
          for (const attempt of matchAttempts) {
            const found = cameraDataMap.get(attempt);
            if (found) {
              cameraData = found;
              break;
            }
          }
          
          if (cameraData) {
            matchedCount++;
            if (imageList.length < 3) {
              console.log(`[${imageList.length}] ✓ Matched IP "${ip}" with Excel data`);
            }
          } else {
            // Debug: Show what IPs are available in the map
            if (imageList.length < 3) {
              console.log(`[${imageList.length}] ✗ No match for IP: "${ip}" (normalized: "${normalizedIP}")`);
              // Show first few IPs from map for comparison
              const sampleMapIPs = Array.from(cameraDataMap.keys()).slice(0, 5);
              console.log(`  Sample IPs in Excel map:`, sampleMapIPs);
            }
            
            // Collect sample IPs for debugging
            if (sampleIPs.length < 5) {
              sampleIPs.push(`Extracted: "${ip}" (normalized: "${normalizedIP}")`);
            }
          }
        } else if (imageList.length < 3) {
          console.log(`[${imageList.length}] ✗ Could not extract IP from filename`);
        }
        
        imageList.push({
          filename,
          path: imageEntry.path,
          ip,
          cameraData,
          assignedAnalytics: new Set<string>(), // Initialize with empty set
          labels: [], // Initialize with empty labels array
        });
      }
      
      console.log(`Matched ${matchedCount} images with camera data out of ${imageList.length}`);
      if (sampleIPs.length > 0 && cameraDataMap.size > 0) {
        console.log('Sample unmatched IPs:', sampleIPs);
        console.log('Sample IPs in Excel map:', Array.from(cameraDataMap.keys()).slice(0, 5));
      }
      
      // Sort by filename
      imageList.sort((a, b) => a.filename.localeCompare(b.filename));
      
      // Load saved data from GCS (dataset-specific)
      const savedData = await loadFromBackend(dataset);
      if (savedData && savedData.length > 0) {
        console.log('Loading saved analytics from GCS...');
        // Merge saved analytics with loaded images
        const savedMap = new Map(savedData.map(item => [item.filename, item]));
        imageList.forEach(img => {
          const saved = savedMap.get(img.filename);
          if (saved) {
            // Restore assigned analytics from Excel format
            ANALYTICS_OPTIONS.forEach(option => {
              const value = saved[option as keyof typeof saved];
              if (value === 'yes') {
                img.assignedAnalytics.add(option);
              }
            });
            
            // Restore labels if available
            if (saved.labels) {
              img.labels = saved.labels;
            }
            if (saved.imageWidth) {
              img.imageWidth = saved.imageWidth;
            }
            if (saved.imageHeight) {
              img.imageHeight = saved.imageHeight;
            }
          }
        });
      }
      
      console.log(`Processed ${imageList.length} images`);
      setAllImages(imageList);
      setImages(imageList);
      setLoading(false);
    } catch (err) {
      console.error('Error loading images:', err);
      setError(err instanceof Error ? err.message : 'Failed to load images. Please run: npm run generate-manifest');
      setLoading(false);
    }
  }, [cameraDataMap]);

  // Load images immediately on mount
  useEffect(() => {
    loadImagesFromFolder();
  }, [loadImagesFromFolder]);
  
  // Update images when camera data becomes available (to match IPs)
  useEffect(() => {
    if (cameraDataMap.size > 0 && allImages.length > 0) {
      // Check if any images need camera data
      const needsUpdate = allImages.some(img => img.ip && !img.cameraData && cameraDataMap.has(normalizeIP(img.ip)));
      
      if (needsUpdate) {
        // Update existing images with camera data
        const updatedImages = allImages.map(img => {
          if (img.ip && !img.cameraData) {
            const cameraData = cameraDataMap.get(normalizeIP(img.ip));
            if (cameraData) {
              return { ...img, cameraData };
            }
          }
          return img;
        });
        setAllImages(updatedImages);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraDataMap.size]); // Only depend on size to avoid infinite loop

  const nextImage = currentIndex < images.length - 1;
  const prevImage = currentIndex > 0;

  if (loading) {
    return (
      <div className="image-viewer-loading">
        <div>Loading images and camera data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="image-viewer-error">
        <div>Error: {error}</div>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="image-viewer-empty">
        <div>No images found. Please ensure images are in the FIXED_20_11_2025 folder.</div>
      </div>
    );
  }

  return (
    <div className="image-viewer-container">
      {/* Header with Camera Details */}
      <div className="camera-header">
        {/* Top Bar with Back Button */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '0.5rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid #444'
        }}>
          <div style={{ fontSize: '0.9rem', color: '#aaa' }}>
            Dataset: {dataset === 'ptz' ? '📹 PTZ' : 
                     dataset === 'new_guntur' ? '🏙️ New Guntur' : 
                     '📁 Existing'}
          </div>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                padding: '8px 16px',
                background: 'rgba(102, 126, 234, 0.8)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 1)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.8)';
              }}
            >
              ← Back to Selection
            </button>
          )}
        </div>
        {/* Navigation Input */}
        <div className="header-navigation" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem', 
          marginBottom: '0.5rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid #444'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="number"
              min="1"
              max={images.length}
              value={navigationInput}
              onChange={(e) => {
                setNavigationInput(e.target.value);
              }}
              onBlur={() => {
                const value = parseInt(navigationInput);
                if (!isNaN(value) && value >= 1 && value <= images.length) {
                  setCurrentIndex(value - 1);
                } else {
                  // Reset to current value if invalid
                  setNavigationInput(String(currentIndex + 1));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const value = parseInt(navigationInput);
                  if (!isNaN(value) && value >= 1 && value <= images.length) {
                    setCurrentIndex(value - 1);
                  } else {
                    // Reset to current value if invalid
                    setNavigationInput(String(currentIndex + 1));
                  }
                  (e.target as HTMLInputElement).blur();
                }
              }}
              style={{
                width: '70px',
                padding: '0.25rem 0.5rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '0.9rem',
                textAlign: 'center',
                outline: 'none'
              }}
              onFocus={(e) => e.target.select()}
            />
            <span style={{ color: '#aaa', fontSize: '0.9rem' }}>/ {images.length}</span>
          </div>
          
          {/* IP Search Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: '500' }}>IP Search:</span>
            <input
              type="text"
              value={ipSearchQuery}
              onChange={(e) => {
                setIpSearchQuery(e.target.value);
                setIpSearchError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const searchIP = normalizeIP(ipSearchQuery.trim());
                  
                  if (searchIP) {
                    // Find first matching image in the full list
                    const matchingIndex = allImages.findIndex(img => {
                      if (!img.ip) return false;
                      const imgIP = normalizeIP(img.ip);
                      return imgIP === searchIP || imgIP.includes(searchIP) || searchIP.includes(imgIP);
                    });
                    
                    if (matchingIndex >= 0) {
                      // Navigate to matching image in full list
                      setCurrentIndex(matchingIndex);
                      setIpSearchError('');
                      // Clear search after navigating (optional - you can remove this if you want to keep the search)
                      // setIpSearchQuery('');
                    } else {
                      setIpSearchError('Invalid IP - No images found');
                    }
                  }
                  
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === 'Escape') {
                  setIpSearchQuery('');
                  setIpSearchError('');
                }
              }}
              placeholder="Enter IP (e.g., 10.242.0.233)"
              style={{
                width: '180px',
                padding: '0.4rem 0.6rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: ipSearchError ? '1px solid #f44336' : '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
              onFocus={(e) => e.target.select()}
            />
            {ipSearchError && (
              <span style={{ color: '#f44336', fontSize: '0.85rem', fontWeight: '500' }}>
                {ipSearchError}
              </span>
            )}
            {ipSearchQuery && (
              <button
                onClick={() => {
                  setIpSearchQuery('');
                  setIpSearchError('');
                }}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            )}
          </div>
          
          {currentImage?.ip && (
            <span style={{ color: '#4CAF50', fontSize: '0.9rem', fontWeight: '600' }}>
              IP: {currentImage.ip}
            </span>
          )}
        </div>
        
        {currentImage?.cameraData ? (
          <div className="header-details">
            {dataset === 'new_guntur' ? (
              // New Guntur headers
              <>
                <div className="header-item">
                  <span className="header-label">S.No.:</span>
                  <span className="header-value">{currentImage.cameraData['S.No'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">I.P:</span>
                  <span className="header-value">{currentImage.cameraData['CAMERA IP'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">POLE NO.:</span>
                  <span className="header-value">{currentImage.cameraData['POLE NO.'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">REF:</span>
                  <span className="header-value">{currentImage.cameraData['REF'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">POLICE STATION NAME:</span>
                  <span className="header-value">{currentImage.cameraData['POLICE STATION NAME'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">LOCATIONNAME:</span>
                  <span className="header-value">{currentImage.cameraData['Location Name'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">LATITUDE:</span>
                  <span className="header-value">{currentImage.cameraData['LATITUDE'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">LONGITUDE:</span>
                  <span className="header-value">{currentImage.cameraData['LONGITUDE'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">Type of Camera:</span>
                  <span className="header-value">{currentImage.cameraData['TYPE OF CAMERA'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">Analytics Existed/Newly proposed:</span>
                  <span className="header-value">{currentImage.cameraData['TYPE OF Analytics'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">Additional/New Analytics required:</span>
                  <span className="header-value">{currentImage.cameraData['Additional/New Analytics required'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">Remarks if any:</span>
                  <span className="header-value">{currentImage.cameraData['Remarks if any'] || 'N/A'}</span>
                </div>
              </>
            ) : (
              // Existing/PTZ headers
              <>
                <div className="header-item">
                  <span className="header-label">Old DISTRICT:</span>
                  <span className="header-value">{currentImage.cameraData['Old DISTRICT'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">NEW DISTRICT:</span>
                  <span className="header-value">{currentImage.cameraData['NEW DISTRICT'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">MANDAL:</span>
                  <span className="header-value">{currentImage.cameraData['MANDAL'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">Location Name:</span>
                  <span className="header-value">{currentImage.cameraData['Location Name'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">LATITUDE:</span>
                  <span className="header-value">{currentImage.cameraData['LATITUDE'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">LONGITUDE:</span>
                  <span className="header-value">{currentImage.cameraData['LONGITUDE'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">CAMERA IP:</span>
                  <span className="header-value">{currentImage.cameraData['CAMERA IP'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">TYPE OF CAMERA:</span>
                  <span className="header-value">{currentImage.cameraData['TYPE OF CAMERA'] || 'N/A'}</span>
                </div>
                <div className="header-item">
                  <span className="header-label">TYPE OF Analytics:</span>
                  <span className="header-value">{currentImage.cameraData['TYPE OF Analytics'] || 'N/A'}</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="header-details">
            <div className="header-item">
              <span className="header-value">
                {currentImage?.ip 
                  ? `IP: ${currentImage.ip} (No matching data in Excel)` 
                  : 'No camera data available - IP could not be extracted from filename'}
              </span>
            </div>
            {currentImage?.ip && (
              <div className="header-item">
                <span className="header-label">Extracted IP:</span>
                <span className="header-value">{currentImage.ip}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="main-content">
        {/* Sidebar with Analytics Assignment */}
        <div className="sidebar">
          <div className="sidebar-header">
            <h3>Assign Analytics</h3>
            <p style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '0.5rem' }}>
              Select analytics for current image
            </p>
          </div>
          
          {/* Labeling Mode Toggle */}
          <div style={{ padding: '0.75rem', borderBottom: '1px solid #444', background: 'rgba(40, 40, 40, 0.95)' }}>
            <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: '#fff' }}>Labeling Tools</h4>
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <button
                onClick={() => setLabelingMode(labelingMode === 'rectangle' ? null : 'rectangle')}
                style={{
                  padding: '0.5rem',
                  background: labelingMode === 'rectangle' ? '#4CAF50' : 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                📦 Rectangle
              </button>
              <button
                onClick={() => setLabelingMode(labelingMode === 'line' ? null : 'line')}
                style={{
                  padding: '0.5rem',
                  background: labelingMode === 'line' ? '#4CAF50' : 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                📏 Line
              </button>
              {labelingMode && (
                <button
                  onClick={() => setLabelingMode(null)}
                  style={{
                    padding: '0.5rem',
                    background: 'rgba(255, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 0, 0, 0.5)',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Exit Labeling
                </button>
              )}
            </div>
          </div>
          
          <div className="sidebar-content">
            {ANALYTICS_OPTIONS.map((option) => (
              <label key={option} className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={sidebarSelectedAnalytics.has(option)}
                  onChange={() => toggleAnalyticsAssignment(option)}
                />
                <span className="checkbox-label">{option}</span>
              </label>
            ))}
          </div>
          <div className="sidebar-footer">
            <button 
              className="clear-filters-btn"
              onClick={() => {
                // Clear current image's analytics
                const currentImg = images[currentIndex];
                if (currentImg) {
                  const updatedImages = allImages.map((img) => {
                    if (img.filename === currentImg.filename) {
                      return { ...img, assignedAnalytics: new Set<string>() };
                    }
                    return img;
                  });
                  setAllImages(updatedImages);
                  setImages(images.map((img) => {
                    if (img.filename === currentImg.filename) {
                      return { ...img, assignedAnalytics: new Set<string>() };
                    }
                    return img;
                  }));
                  // Don't auto-save - user must click save button
                  setSidebarSelectedAnalytics(new Set());
                }
              }}
            >
              Clear Selection
            </button>
            <button 
              className="save-btn"
              onClick={handleSaveCurrentImage}
              disabled={saving || !currentImage}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginTop: '0.5rem',
                background: saving ? '#666' : '#4CAF50',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: '600',
                cursor: saving || !currentImage ? 'not-allowed' : 'pointer',
                opacity: saving || !currentImage ? 0.6 : 1,
                transition: 'all 0.2s'
              }}
            >
              {saving ? 'Saving...' : '💾 Save This Image'}
            </button>
            {saveStatus.message && (
              <div style={{ 
                marginTop: '0.5rem', 
                padding: '0.5rem',
                fontSize: '0.8rem',
                textAlign: 'center',
                color: saveStatus.type === 'success' ? '#4CAF50' : saveStatus.type === 'error' ? '#f44336' : '#aaa',
                fontWeight: '500'
              }}>
                {saveStatus.message}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '0.5rem', textAlign: 'center' }}>
              Click Save to persist changes
            </div>
          </div>
        </div>

        {/* Full Screen Image */}
        <div className="image-display">
        {labelingMode ? (
          <LabelingCanvas
            imageSrc={currentImage?.path || ''}
            labels={currentImage?.labels || []}
            onLabelsChange={(newLabels) => {
              const updatedImages = allImages.map((img) => {
                if (img.filename === currentImage?.filename) {
                  return { ...img, labels: newLabels };
                }
                return img;
              });
              setAllImages(updatedImages);
              setImages(images.map((img) => {
                if (img.filename === currentImage?.filename) {
                  return { ...img, labels: newLabels };
                }
                return img;
              }));
              // Don't auto-save - user must click save button
            }}
            mode={labelingMode}
            imageWidth={imageDimensions?.width || 0}
            imageHeight={imageDimensions?.height || 0}
          />
        ) : (
          <ImageWithLabels
            imageSrc={currentImage?.path || ''}
            labels={currentImage?.labels || []}
            imageWidth={currentImage?.imageWidth}
            imageHeight={currentImage?.imageHeight}
            onImageLoad={(width, height) => {
              setImageDimensions({ width, height });
              // Update image dimensions in current image
              const updatedImages = allImages.map((imgData) => {
                if (imgData.filename === currentImage?.filename) {
                  return { 
                    ...imgData, 
                    imageWidth: width, 
                    imageHeight: height 
                  };
                }
                return imgData;
              });
              setAllImages(updatedImages);
            }}
          />
        )}

        {/* Navigation Buttons */}
        {prevImage && (
          <button 
            className="nav-button nav-button-left"
            onClick={() => setCurrentIndex(prev => prev - 1)}
            aria-label="Previous image"
          >
            ←
          </button>
        )}
        {nextImage && (
          <button 
            className="nav-button nav-button-right"
            onClick={() => setCurrentIndex(prev => prev + 1)}
            aria-label="Next image"
          >
            →
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

