'use client'

import { useEffect, useRef, useState } from 'react'
import { detectChar } from '@/utils/detectChar'
import type { DebugInfo } from '@/utils/detectChar'
import type { Point } from '@/utils/handTypes'

declare global {
  interface Window {
    Hands: any
    drawLandmarks: any
    drawConnectors: any
  }
}

const SMOOTH_WINDOW = 5
const REQUIRED_STABLE_FRAMES = 15
const STABLE_THRESHOLD = 0.4
const NEXT_HOLD_MS = 1200

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /* ================= UI STATE ================= */
  const [currentLetter, setCurrentLetter] = useState('—')
  const [pendingWord, setPendingWord] = useState('')
  const [committedSentence, setCommittedSentence] = useState('')
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [flipped, setFlipped] = useState(false)

  /* ================= REFS (LOGIC ONLY) ================= */
  const lastLandmarksRef = useRef<Point[] | null>(null)
  const stableFramesRef = useRef(0)
  const smoothQueueRef = useRef<string[]>([])

  const lockedLetterRef = useRef<string>('')     // ✅ REAL letter storage
  const wordRef = useRef<string>('')             // ✅ REAL word storage
  const nextLockRef = useRef(false)
  const nextTimerRef = useRef<NodeJS.Timeout | null>(null)

  /* ================= HELPERS ================= */

  const smoothPrediction = (pred: string) => {
    if (pred === '—' || pred.toLowerCase() === 'next') return pred
    smoothQueueRef.current.push(pred)
    if (smoothQueueRef.current.length > SMOOTH_WINDOW)
      smoothQueueRef.current.shift()

    const freq: Record<string, number> = {}
    for (const p of smoothQueueRef.current) freq[p] = (freq[p] || 0) + 1
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
  }

  const isHandStable = (lm: Point[]) => {
    if (!lastLandmarksRef.current) {
      lastLandmarksRef.current = lm
      stableFramesRef.current = 0
      return false
    }

    let movement = 0
    for (let i = 0; i < lm.length; i++) {
      const dx = lm[i]?.x - lastLandmarksRef.current[i]?.x
      const dy = lm[i]?.y - lastLandmarksRef.current[i]?.y
      movement += Math.sqrt(dx * dx + dy * dy)
    }

    movement /= lm.length
    lastLandmarksRef.current = lm

    if (movement < STABLE_THRESHOLD) stableFramesRef.current++
    else stableFramesRef.current = 0

    return stableFramesRef.current >= REQUIRED_STABLE_FRAMES
  }

  /* ================= MAIN EFFECT ================= */

  useEffect(() => {
    let hands: any

    const init = async () => {
      const scripts = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
        'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
      ]

      for (const src of scripts) {
        if (!document.querySelector(`script[src="${src}"]`)) {
          await new Promise<void>(res => {
            const s = document.createElement('script')
            s.src = src
            s.onload = () => res()
            document.body.appendChild(s)
          })
        }
      }

      const video = videoRef.current!
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!

      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      video.srcObject = stream
      await video.play()

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      hands = new window.Hands({
        locateFile: (f: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      })

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      })

      hands.onResults((results: any) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.save()

        if (flipped) {
          ctx.translate(canvas.width, 0)
          ctx.scale(-1, 1)
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        if (!results.multiHandLandmarks?.length) {
          stableFramesRef.current = 0
          lockedLetterRef.current = ''
          nextLockRef.current = false
          ctx.restore()
          return
        }

        const lm: Point[] = results.multiHandLandmarks[0]
        window.drawConnectors(ctx, lm, window.Hands.HAND_CONNECTIONS)
        window.drawLandmarks(ctx, lm)

        const result = detectChar(lm, debugEnabled)
        if (debugEnabled && result.debug) setDebugInfo(result.debug)

        const stable = isHandStable(lm)
        const rawChar = result.letter

        /* ===== NEXT ===== */
        if (rawChar.toLowerCase() === 'next' && stable) {
          setCurrentLetter('Next')

          if (!nextLockRef.current) {
            nextLockRef.current = true

            if (lockedLetterRef.current) {
              wordRef.current += lockedLetterRef.current
              setPendingWord(wordRef.current)
              lockedLetterRef.current = ''
            }

            if (nextTimerRef.current) clearTimeout(nextTimerRef.current)
            nextTimerRef.current = setTimeout(() => {
              if (wordRef.current.trim()) {
                setCommittedSentence(s =>
                  s ? `${s} ${wordRef.current}` : wordRef.current
                )
              }
              wordRef.current = ''
              setPendingWord('')
              nextLockRef.current = false
            }, NEXT_HOLD_MS)
          }

          ctx.restore()
          return
        }

        /* ===== LETTER ===== */
        if (rawChar !== '—' && stable) {
          const smoothed = smoothPrediction(rawChar)
          lockedLetterRef.current = smoothed
          setCurrentLetter(smoothed)
          nextLockRef.current = false

          if (nextTimerRef.current) {
            clearTimeout(nextTimerRef.current)
            nextTimerRef.current = null
          }
        }

        ctx.restore()
      })

      await hands.initialize()

      const loop = async () => {
        await hands.send({ image: video })
        requestAnimationFrame(loop)
      }
      loop()
    }

    init()

    return () => {
      if (nextTimerRef.current) clearTimeout(nextTimerRef.current)
    }
  }, [flipped, debugEnabled])

  /* ================= UI ================= */

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-700 to-indigo-600 flex flex-col items-center p-4 text-white">
      <h1 className="text-4xl font-bold mb-4">🤚 Hand Gesture Test</h1>

      <div className="relative w-[640px] h-[480px] border-4 border-white rounded-lg overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full" />
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white text-black px-5 py-2 rounded-full text-2xl font-bold">
          {currentLetter}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setFlipped(f => !f)}
          className="px-4 py-2 bg-white text-black rounded"
        >
          Flip
        </button>
        <button
          onClick={() => setDebugEnabled(d => !d)}
          className="px-4 py-2 bg-white text-black rounded"
        >
          {debugEnabled ? 'Hide Debug' : 'Show Debug'}
        </button>
      </div>

      <p className="mt-4 bg-white text-black p-2 rounded w-[640px]">
        <b>Sentence:</b> {committedSentence}
      </p>

      <p className="mt-2 bg-white text-black p-2 rounded w-[640px]">
        <b>Pending Word:</b> {pendingWord}
      </p>

      <video ref={videoRef} hidden />
    </div>
  )
}
