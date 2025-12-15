// components/GestureDetector.tsx
import React, { useRef, useEffect, useState } from 'react';
import { Point, DetectionResult, detectGesture } from '../utils/normalizedDetection';

const GestureDetector: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);

  // Initialize camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOn(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };

  // Mock hand detection (replace with actual MediaPipe/HandTrack)
  const detectHands = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Mock hand landmarks for demonstration
    const mockLandmarks: Point[] = Array.from({ length: 21 }, (_, i) => ({
      x: 300 + Math.sin(Date.now() / 1000 + i) * 50,
      y: 200 + Math.cos(Date.now() / 1000 + i) * 50
    }));

    // Process detection
    const result = detectGesture(mockLandmarks);
    setDetectionResult(result);

    // Draw on canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    drawHand(ctx, mockLandmarks, result);
  };

  // Draw hand landmarks
  const drawHand = (ctx: CanvasRenderingContext2D, pts: Point[], result: DetectionResult) => {
    if (pts.length < 21) return;

    // Draw connections
    ctx.strokeStyle = result.confidence > 0.7 ? 'green' : 'orange';
    ctx.lineWidth = 2;
    
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20]
    ];

    connections.forEach(([start, end]) => {
      ctx.beginPath();
      ctx.moveTo(pts[start].x, pts[start].y);
      ctx.lineTo(pts[end].x, pts[end].y);
      ctx.stroke();
    });

    // Draw landmarks
    pts.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = result.confidence > 0.7 ? 'green' : 'red';
      ctx.fill();
    });

    // Draw detection text
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.fillText(`Detected: ${result.character || 'None'}`, 10, 30);
    ctx.fillText(`Confidence: ${Math.round(result.confidence * 100)}%`, 10, 50);
  };

  // Animation loop
  useEffect(() => {
    if (!isCameraOn) return;

    const animationFrame = requestAnimationFrame(() => {
      detectHands();
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [isCameraOn]);

  return (
    <div className="gesture-detector">
      <h2>Gesture Detector</h2>
      
      <div className="controls">
        <button onClick={startCamera} disabled={isCameraOn}>
          {isCameraOn ? 'Camera Running' : 'Start Camera'}
        </button>
      </div>

      <div className="video-container">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          style={{ display: 'none' }}
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          style={{ border: '1px solid #ccc', background: '#000' }}
        />
      </div>

      {detectionResult && (
        <div className="detection-info">
          <h3>Detection Results:</h3>
          <p>Character: <strong>{detectionResult.character || 'None'}</strong></p>
          <p>Confidence: <strong>{Math.round(detectionResult.confidence * 100)}%</strong></p>
          <p>Group: <strong>{detectionResult.group}</strong></p>
          
          <h4>Normalized Distances:</h4>
          <ul>
            {Object.entries(detectionResult.normalizedDistances).map(([key, value]) => (
              <li key={key}>{key}: {value.toFixed(2)}</li>
          ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default GestureDetector;