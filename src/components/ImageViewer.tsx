import { useState, useEffect, useCallback } from 'react';
import { extractIPFromFilename, normalizeIP } from '../utils/imageUtils';
import { loadCameraDataFromExcel, type CameraData } from '../utils/excelUtils';
import { saveData, loadFromBackend } from '../utils/saveData';
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

export default function ImageViewer() {
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

  // Load Excel data first (non-blocking)
  useEffect(() => {
    async function loadData() {
      try {
        console.log('Loading Excel data...');
        const dataMap = await loadCameraDataFromExcel('/all_cams.xlsx');
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

  // Always show all images (no filtering)
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
    
    // Auto-save to GCS whenever analytics are changed
    saveData(updatedImages);
    
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
  
  

  // Function to load images from the manifest file
  const loadImagesFromFolder = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading image manifest...');
      
      // Load image manifest
      const manifestResponse = await fetch('/image-manifest.json');
      if (!manifestResponse.ok) {
        throw new Error(`Failed to load image manifest: ${manifestResponse.status} ${manifestResponse.statusText}`);
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
          // Try multiple matching strategies
          const normalizedIP = normalizeIP(ip);
          cameraData = cameraDataMap.get(normalizedIP) || 
                      cameraDataMap.get(ip) || 
                      cameraDataMap.get(ip.replace(/\./g, '_')) ||
                      cameraDataMap.get(ip.replace(/_/g, '.')) ||
                      null;
          
          if (cameraData) {
            matchedCount++;
            if (imageList.length < 3) {
              console.log(`[${imageList.length}] ✓ Matched with Excel data`);
            }
          } else if (imageList.length < 3) {
            console.log(`[${imageList.length}] ✗ No match in Excel for IP: ${ip}`);
          }
          
          // Collect sample IPs for debugging
          if (sampleIPs.length < 5 && !cameraData) {
            sampleIPs.push(`Extracted: "${ip}" (normalized: "${normalizedIP}")`);
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
      
      // Load saved data from GCS
      const savedData = await loadFromBackend();
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
        {/* Navigation Input at Top */}
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
          {currentImage?.ip && (
            <span style={{ color: '#4CAF50', fontSize: '0.9rem', fontWeight: '600' }}>
              IP: {currentImage.ip}
            </span>
          )}
        </div>
        
        {currentImage?.cameraData ? (
          <div className="header-details">
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
                  saveData(updatedImages);
                  setSidebarSelectedAnalytics(new Set());
                }
              }}
            >
              Clear Selection
            </button>
            <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '0.5rem', textAlign: 'center' }}>
              Auto-saving to file (Downloads folder)
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
              saveData(updatedImages);
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

