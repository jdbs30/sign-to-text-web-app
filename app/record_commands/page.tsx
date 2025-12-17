'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Point } from '@/utils/handTypes';
import { LetterProfiler } from '@/utils/letterProfiler';

/* =============================
   COMMAND LIST
============================= */
const COMMANDS = ['next', 'Backspace', 'I Love You'];

/* =============================
   COMPONENT
============================= */
export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const latestPtsRef = useRef<Point[] | null>(null);
  const profilerRef = useRef(new LetterProfiler());

  /* UI state */
  const [lastRecorded, setLastRecorded] = useState<string | null>(null);
  const [profilerData, setProfilerData] = useState<any>(null);
  const [sampleCounts, setSampleCounts] = useState<Record<string, number>>({});
  const [showRecorder, setShowRecorder] = useState(true);

  /* =============================
     INIT CAMERA + MEDIAPIPE
  ============================== */
  useEffect(() => {
    const loadScript = (src: string) =>
      new Promise<void>((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        document.body.appendChild(s);
      });

    const init = async () => {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');

      if (!videoRef.current || !canvasRef.current) return;

      const hands = new (window as any).Hands({
        locateFile: (f: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });

      hands.onResults((results: any) => {
        if (!results.multiHandLandmarks?.length) return;

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

        const pts: Point[] = results.multiHandLandmarks[0].map((p: any) => ({
          x: p.x,
          y: p.y,
          z: p.z,
        }));

        latestPtsRef.current = pts;

        // Draw landmarks
        ctx.fillStyle = 'lime';
        pts.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      const camera = new (window as any).Camera(videoRef.current, {
        onFrame: async () => {
          await hands.send({ image: videoRef.current });
        },
        width: 640,
        height: 480,
      });

      camera.start();
    };

    init();
  }, []);

  /* =============================
     RECORD COMMAND
  ============================== */
  const recordCommand = (command: string) => {
    const pts = latestPtsRef.current;
    if (!pts || pts.length !== 21) {
      alert('No valid hand landmarks detected.');
      return;
    }

    profilerRef.current.recordStatic(command, 'command', 'CMD', pts);
    setProfilerData(profilerRef.current.exportData());
    setLastRecorded(command);

    setSampleCounts(prev => ({
      ...prev,
      [command]: (prev[command] || 0) + 1,
    }));
  };

  /* =============================
     DOWNLOAD DATA
  ============================== */
  const downloadJSON = () => {
    if (!profilerData) return;
    const blob = new Blob(
      [JSON.stringify(profilerData, null, 2)],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'command_profiler_data.json';
    a.click();
  };

  /* =============================
     UI
  ============================== */
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 font-sans">
      <h1 className="text-2xl font-bold text-center">
        Command Gesture Recorder
      </h1>

      <div className="relative">
        <video ref={videoRef} autoPlay muted playsInline className="hidden" />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full border rounded shadow"
        />
      </div>

      <div className="text-center text-lg">
        Last recorded: <strong>{lastRecorded ?? '-'}</strong>
      </div>

      <div className="border rounded p-4 space-y-3">
        <button
          onClick={() => setShowRecorder(!showRecorder)}
          className="font-semibold"
        >
          {showRecorder ? 'Hide Recorder' : 'Show Recorder'}
        </button>

        {showRecorder && (
          <>
            <div className="flex flex-wrap gap-2 mt-3">
              {COMMANDS.map(cmd => (
                <button
                  key={cmd}
                  onClick={() => recordCommand(cmd)}
                  className="px-3 py-1 border rounded  hover:bg-gray-800"
                >
                  {cmd} ({sampleCounts[cmd] ?? 0})
                </button>
              ))}
            </div>

            <button
              onClick={downloadJSON}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
            >
              Download JSON
            </button>
          </>
        )}
      </div>
    </div>
  );
}
