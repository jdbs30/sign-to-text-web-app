'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';

import { detectChar } from '@/utils/detectChar';
import type { Point } from '@/utils/handTypes';
import { LetterProfiler } from '@/utils/letterProfiler';
import { useDelayedSmoothing } from '@/hooks/useDelayedSmoothing';

/* ============================= 
   LETTER GROUPS
============================= */
const LETTER_GROUPS: Record<string, string[]> = {
  G1: ['y', 'j'],
  G2: ['c', 'o'],
  G3: ['g', 'h'],
  G4: ['b','d','f','i','u','v','k','r','w'],
  G5: ['p','q','z'],
  G6: ['a','e','m','n','s','t'],
  G7: ['l'],
  G8: ['x']
};

function getLetterGroup(letter: string): string | null {
  letter = letter.toLowerCase();
  for (const groupId in LETTER_GROUPS) {
    if (LETTER_GROUPS[groupId].includes(letter)) return groupId;
  }
  return null;
}

/* ============================= 
   HYBRID RESOLVER
============================= */
function resolveChar(
  cnnChar: string,
  cnnConf: number,
  heuristic: any,
  prevChar: string
) {
  const hChar = heuristic?.letter ?? '';

  if (['next', 'Backspace'].includes(hChar)) return hChar;

  const cnnGroup = getLetterGroup(cnnChar);
  const hGroup = getLetterGroup(hChar);

  if (cnnGroup && hGroup && cnnGroup === hGroup) return hChar;

  if (cnnChar === hChar && cnnConf > 0.5) return cnnChar;
  if (cnnConf > 0.75 && cnnChar.length === 1) return cnnChar;
  if (cnnConf < 0.6 && hChar.length === 1) return hChar;

  return prevChar;
}

/* ============================= 
   COMPONENT
============================= */
export default function DebugHandTyping() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestPtsRef = useRef<Point[] | null>(null);
  const profilerRef = useRef(new LetterProfiler());

  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [typedStr, setTypedStr] = useState('');
  const [currentSymbol, setCurrentSymbol] = useState('');
  const [currentGroup, setCurrentGroup] = useState<string | null>(null);
  const [lastRecorded, setLastRecorded] = useState<string | null>(null);
  const [profilerData, setProfilerData] = useState<any>(null);
  const [showRecorder, setShowRecorder] = useState(false);

  const stableCharRef = useRef('');
  const stableCountRef = useRef(0);
  const committedCharRef = useRef<string | null>(null);

  const { processLandmark } = useDelayedSmoothing(3, 0.8);

  /* ============================= 
     LOAD CNN MODEL
  ============================== */
  useEffect(() => {
    tf.ready().then(async () => {
      const m = await tf.loadLayersModel('/model/model.json');
      setModel(m);
    });
  }, []);

  /* ============================= 
     INIT MEDIAPIPE & CAMERA
  ============================== */
  useEffect(() => {
    if (!model) return;

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

      tempCanvasRef.current = document.createElement('canvas');
      tempCanvasRef.current.width = 400;
      tempCanvasRef.current.height = 400;

      const hands = new (window as any).Hands({
        locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.6,
      });

      hands.onResults((results: any) => {
        if (!results.multiHandLandmarks?.length) return;

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Camera preview
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

        const rawPts: Point[] = results.multiHandLandmarks[0].map((p: any) => ({
          x: p.x,
          y: p.y,
          z: p.z,
        }));

        const pts = rawPts.map((p, i) => processLandmark(i, p) ?? p);
        latestPtsRef.current = pts;

        // Draw landmarks
        ctx.fillStyle = 'lime';
        pts.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
          ctx.fill();
        });

        const heuristic = detectChar(pts);

        // CNN input
        const temp = tempCanvasRef.current!;
        const tctx = temp.getContext('2d')!;
        tctx.clearRect(0, 0, 400, 400);
        tctx.drawImage(results.image, 0, 0, 400, 400);

        const { cnnChar, cnnConf } = tf.tidy(() => {
          const input = tf.browser.fromPixels(temp).toFloat().div(255).expandDims(0);
          const logits = model.predict(input) as tf.Tensor;
          const probs = logits.softmax();
          const data = probs.dataSync();
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const idx = data.indexOf(Math.max(...data));
          return { cnnChar: letters[idx] || '', cnnConf: data[idx] };
        });

        const resolved = resolveChar(cnnChar, cnnConf, heuristic, stableCharRef.current);

        // Stability & commit
        if (resolved === stableCharRef.current) {
          stableCountRef.current++;
        } else {
          stableCharRef.current = resolved;
          stableCountRef.current = 0;
          committedCharRef.current = null;
        }

        if (stableCountRef.current === 10) {
          if (committedCharRef.current !== resolved) {
            if (resolved === 'Backspace') setTypedStr((s) => s.slice(0, -1));
            else if (resolved === 'next') setTypedStr((s) => s + ' ');
            else if (resolved.length === 1) setTypedStr((s) => s + resolved);

            committedCharRef.current = resolved;
          }
          stableCountRef.current = 0;
        }

        setCurrentSymbol(resolved);
        setCurrentGroup(getLetterGroup(resolved));
      });

      const camera = new (window as any).Camera(videoRef.current, {
        onFrame: async () => hands.send({ image: videoRef.current }),
        width: 640,
        height: 480,
      });
      camera.start();
    };

    init();
  }, [model, processLandmark]);

  /* ============================= 
     MANUAL RECORDING
  ============================== */
  const recordLetter = (letter: string) => {
    const pts = latestPtsRef.current;
    if (!pts || pts.length !== 21) {
      alert('No valid hand landmarks detected.');
      return;
    }
    profilerRef.current.recordSample(letter, pts);
    setProfilerData(profilerRef.current.exportData());
    setLastRecorded(letter);
  };

  const downloadJSON = () => {
    if (!profilerData) return;
    const blob = new Blob([JSON.stringify(profilerData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hand_profiler_data.json';
    a.click();
  };

  /* ============================= 
     UI
  ============================== */
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 font-sans">
      <h1 className="text-2xl font-bold text-center">Hand Typing Debug</h1>

      <div className="relative">
        <video ref={videoRef} autoPlay playsInline muted className="hidden" />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full rounded-lg shadow-lg border"
        />
      </div>

      <div className="flex justify-between items-center text-lg font-medium">
        <div>
          Typed: <span className="text-blue-600">{typedStr}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>
            Current: <span className="text-green-600">{currentSymbol}</span>
          </span>
          {currentGroup && (
            <span className="px-2 py-1 bg-purple-200 text-purple-800 rounded-full text-sm font-semibold">
              {currentGroup}
            </span>
          )}
        </div>
      </div>

      {/* Collapsible recorder */}
      <div className="border rounded p-3 shadow">
        <button
          className="w-full text-left font-semibold px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
          onClick={() => setShowRecorder(!showRecorder)}
        >
          {showRecorder ? 'Hide Manual Recorder' : 'Show Manual Recorder'}
        </button>

        {showRecorder && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => (
                <button
                  key={l}
                  onClick={() => recordLetter(l)}
                  className="px-3 py-1 border rounded bg-white hover:bg-gray-100 shadow-sm"
                >
                  {l}
                </button>
              ))}
            </div>

            {lastRecorded && (
              <div className="text-green-600 mt-1">
                Recorded sample for: <strong>{lastRecorded}</strong>
              </div>
            )}

            <button
              onClick={downloadJSON}
              className="px-4 py-1 border rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Download JSON
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
