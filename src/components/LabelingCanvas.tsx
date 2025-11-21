import { useState, useRef, useEffect } from 'react';
import './LabelingCanvas.css';

export type LabelType = 'rectangle' | 'line';

export interface Label {
  id: string;
  type: LabelType;
  coordinates: number[]; // Normalized coordinates (0-1)
  label?: string; // Optional label text
}

interface LabelingCanvasProps {
  imageSrc: string;
  labels: Label[];
  onLabelsChange: (labels: Label[]) => void;
  mode: LabelType;
  imageWidth: number;
  imageHeight: number;
}

export default function LabelingCanvas({
  imageSrc,
  labels,
  onLabelsChange,
  mode,
  imageWidth: _imageWidth,
  imageHeight: _imageHeight,
}: LabelingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentLabel, setCurrentLabel] = useState<Label | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  // Convert normalized coordinates to canvas pixels
  const normalizedToCanvas = (normalized: number[], canvasWidth: number, canvasHeight: number): number[] => {
    if (mode === 'rectangle') {
      // [x1, y1, x2, y2] normalized -> canvas pixels
      return [
        normalized[0] * canvasWidth,
        normalized[1] * canvasHeight,
        normalized[2] * canvasWidth,
        normalized[3] * canvasHeight,
      ];
    } else {
      // [x1, y1, x2, y2] normalized -> canvas pixels
      return [
        normalized[0] * canvasWidth,
        normalized[1] * canvasHeight,
        normalized[2] * canvasWidth,
        normalized[3] * canvasHeight,
      ];
    }
  };

  // Convert canvas pixels to normalized coordinates (0-1)
  const canvasToNormalized = (pixels: number[], canvasWidth: number, canvasHeight: number): number[] => {
    return [
      pixels[0] / canvasWidth,
      pixels[1] / canvasHeight,
      pixels[2] / canvasWidth,
      pixels[3] / canvasHeight,
    ];
  };

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    
    const pos = getMousePos(e);
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsDrawing(true);
    setStartPoint(pos);
    
    const newLabel: Label = {
      id: Date.now().toString(),
      type: mode,
      coordinates: [pos.x / canvas.width, pos.y / canvas.height, pos.x / canvas.width, pos.y / canvas.height],
    };
    setCurrentLabel(newLabel);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !currentLabel) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = getMousePos(e);
    const normalized = canvasToNormalized(
      [startPoint.x, startPoint.y, pos.x, pos.y],
      canvas.width,
      canvas.height
    );

    setCurrentLabel({
      ...currentLabel,
      coordinates: normalized,
    });

    drawCanvas();
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentLabel) return;

    setIsDrawing(false);
    
    // Only save if the label has some size
    const coords = currentLabel.coordinates;
    if (mode === 'rectangle') {
      const width = Math.abs(coords[2] - coords[0]);
      const height = Math.abs(coords[3] - coords[1]);
      if (width > 0.01 && height > 0.01) {
        // Normalize coordinates (ensure x1 < x2, y1 < y2)
        const normalized = [
          Math.min(coords[0], coords[2]),
          Math.min(coords[1], coords[3]),
          Math.max(coords[0], coords[2]),
          Math.max(coords[1], coords[3]),
        ];
        // Automatically assign "ROI" as label name for rectangles
        onLabelsChange([...labels, { ...currentLabel, coordinates: normalized, label: 'ROI' }]);
      }
    } else {
      const length = Math.sqrt(
        Math.pow(coords[2] - coords[0], 2) + Math.pow(coords[3] - coords[1], 2)
      );
      if (length > 0.01) {
        // Automatically assign "line" as label name for lines
        onLabelsChange([...labels, { ...currentLabel, label: 'line' }]);
      }
    }

    setCurrentLabel(null);
    setStartPoint(null);
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing labels
    labels.forEach((label) => {
      const coords = normalizedToCanvas(label.coordinates, canvas.width, canvas.height);
      
      ctx.strokeStyle = selectedLabel === label.id ? '#00ff00' : '#ff0000';
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

      // Draw label text if available
      if (label.label) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px Arial';
        ctx.fillText(label.label, coords[0] + 5, coords[1] - 5);
      }
    });

    // Draw current label being created
    if (currentLabel) {
      const coords = normalizedToCanvas(
        currentLabel.coordinates,
        canvas.width,
        canvas.height
      );

      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      if (currentLabel.type === 'rectangle') {
        const [x1, y1, x2, y2] = coords;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      } else {
        const [x1, y1, x2, y2] = coords;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;

    const updateCanvasSize = () => {
      const container = containerRef.current;
      if (!container) return;

      const img = new Image();
      img.onload = () => {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Calculate aspect ratio
        const imgAspect = img.width / img.height;
        const containerAspect = containerWidth / containerHeight;

        let canvasWidth, canvasHeight;
        if (imgAspect > containerAspect) {
          canvasWidth = containerWidth;
          canvasHeight = containerWidth / imgAspect;
        } else {
          canvasHeight = containerHeight;
          canvasWidth = containerHeight * imgAspect;
        }

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        drawCanvas();
      };
      img.src = imageSrc;
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [imageSrc, labels, currentLabel, selectedLabel]);

  useEffect(() => {
    drawCanvas();
  }, [labels, currentLabel, selectedLabel]);

  const handleDeleteLabel = (labelId: string) => {
    onLabelsChange(labels.filter((l) => l.id !== labelId));
    setSelectedLabel(null);
  };

  return (
    <div className="labeling-container" ref={containerRef}>
      <img 
        src={imageSrc} 
        alt="Labeling"
        onError={(e) => {
          console.error('LabelingCanvas image error:', imageSrc);
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1,
          pointerEvents: 'none'
        }}
      />
      <canvas
        ref={canvasRef}
        className="labeling-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      {/* Label list */}
      <div className="labels-panel">
        <h4>Labels ({labels.length})</h4>
        <div className="labels-list">
          {labels.map((label) => (
            <div
              key={label.id}
              className={`label-item ${selectedLabel === label.id ? 'selected' : ''}`}
              onClick={() => setSelectedLabel(label.id)}
            >
              <span className="label-type">{label.type}</span>
              <span className="label-name">{label.label || (label.type === 'rectangle' ? 'ROI' : 'line')}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteLabel(label.id);
                }}
                className="delete-label-btn"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

