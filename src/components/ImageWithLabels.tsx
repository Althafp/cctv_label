import { useEffect, useRef, useState } from 'react';
import type { Label } from '../utils/saveData';
import './ImageWithLabels.css';

interface ImageWithLabelsProps {
  imageSrc: string;
  labels: Label[];
  imageWidth?: number;
  imageHeight?: number;
  onImageLoad?: (width: number, height: number) => void;
}

export default function ImageWithLabels({
  imageSrc,
  labels,
  imageWidth: _imageWidth,
  imageHeight: _imageHeight,
  onImageLoad,
}: ImageWithLabelsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Convert normalized coordinates to canvas pixels
  const normalizedToCanvas = (normalized: number[], canvasWidth: number, canvasHeight: number): number[] => {
    return [
      normalized[0] * canvasWidth,
      normalized[1] * canvasHeight,
      normalized[2] * canvasWidth,
      normalized[3] * canvasHeight,
    ];
  };

  const drawLabels = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw labels
    labels.forEach((label) => {
      const coords = normalizedToCanvas(label.coordinates, canvas.width, canvas.height);
      
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);

      if (label.type === 'rectangle') {
        const [x1, y1, x2, y2] = coords;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      } else {
        const [x1, y1, x2, y2] = coords;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Draw label text
      const labelText = label.label || (label.type === 'rectangle' ? 'ROI' : 'line');
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Arial';
      ctx.fillText(labelText, coords[0] + 5, coords[1] - 5);
    });
  };

  // Update canvas size when image loads or container resizes
  const updateCanvasSize = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const container = containerRef.current;
    if (!canvas || !img || !container) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const containerAspect = containerWidth / containerHeight;

      let canvasWidth, canvasHeight;
      if (imgAspect > containerAspect) {
        canvasWidth = containerWidth;
      canvasHeight = canvasWidth / imgAspect;
      } else {
        canvasHeight = containerHeight;
        canvasWidth = containerHeight * imgAspect;
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      drawLabels();
    };

  // Reset loading state when image source changes
  useEffect(() => {
    setIsLoading(true);
    setImageError(null);
  }, [imageSrc]);

  // Set up timeout for loading - 15 seconds
  useEffect(() => {
    if (!isLoading) return;
    
    const timeout = setTimeout(() => {
      console.error('⏱️ Image loading timeout:', imageSrc);
      setIsLoading(false);
      setImageError('Image loading timeout.');
    }, 15000);

    return () => clearTimeout(timeout);
  }, [imageSrc, isLoading]);

  // Handle window resize and update canvas
  useEffect(() => {
    if (!isLoading && !imageError && imgRef.current?.complete) {
      updateCanvasSize();
    }
    const handleResize = () => updateCanvasSize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, isLoading, imageError, labels]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setIsLoading(false);
    setImageError(null);
    
    // Update canvas immediately
      updateCanvasSize();
    
      if (onImageLoad) {
        onImageLoad(img.naturalWidth, img.naturalHeight);
      }
    };

  const handleImageError = () => {
    setIsLoading(false);
    setImageError('Failed to load image.');
  };

  // Show error state
  if (imageError) {
    return (
      <div className="image-with-labels-container" ref={containerRef} style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#ff6b6b',
        padding: '2rem'
      }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>⚠️ Image Failed to Load</div>
        <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem', wordBreak: 'break-all' }}>
          {imageError}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '1rem' }}>
          URL: {imageSrc}
        </div>
        <button 
          onClick={() => {
            setImageError(null);
            setIsLoading(true);
            if (imgRef.current) {
              imgRef.current.src = imageSrc + '?t=' + Date.now();
            }
          }}
          style={{
            padding: '0.5rem 1rem',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="image-with-labels-container" ref={containerRef}>
      {isLoading && (
        <div style={{ 
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#aaa',
          zIndex: 10,
          pointerEvents: 'none'
        }}>
          Loading...
        </div>
      )}
      <img
        ref={imgRef}
        src={imageSrc}
        alt="Image with labels"
        className="image-with-labels-img"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onLoad={handleImageLoad}
        onError={handleImageError}
        style={{ 
          display: isLoading ? 'none' : 'block',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
        decoding="async"
        fetchPriority="high"
      />
      <canvas
        ref={canvasRef}
        className="image-with-labels-canvas"
      />
    </div>
  );
}
