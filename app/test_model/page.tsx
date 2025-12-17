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

const LETTER_HOLD_MS = 2000
const NEXT_HOLD_MS = 2000

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
	const nextTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [currentLetter, setCurrentLetter] = useState('—')
  const [pendingWord, setPendingWord] = useState('')
  const [committedSentence, setCommittedSentence] = useState('')
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [flipped, setFlipped] = useState(false)

  // Hold refs
  const letterHoldStartRef = useRef<number | null>(null)
  const nextHoldStartRef = useRef<number | null>(null)
  const lockedLetterRef = useRef<string>('')
  const pendingWordRef = useRef<string>('')

  useEffect(() => {
    let hands: any

    const init = async () => {
      const scripts = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
        'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
      ]
      for (const src of scripts) {
        if (!document.querySelector(`script[src="${src}"]`)) {
          await new Promise<void>((res) => {
            const s = document.createElement('script')
            s.src = src
            s.onload = () => res()
            document.body.appendChild(s)
          })
        }
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
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

        // No hand detected
        if (!results.multiHandLandmarks?.length) {
          letterHoldStartRef.current = null
          nextHoldStartRef.current = null
          lockedLetterRef.current = ''
          ctx.restore()
          return
        }

        const lm: Point[] = results.multiHandLandmarks[0]
        window.drawConnectors(ctx, lm, window.Hands.HAND_CONNECTIONS)
        window.drawLandmarks(ctx, lm)

        const result = detectChar(lm, debugEnabled)
        if (debugEnabled && result.debug) setDebugInfo(result.debug)
        setCurrentLetter(result.letter)

        const now = performance.now()

        // ===== LETTER HOLD =====
        if (result.letter !== '—' && result.letter.toLowerCase() !== 'next') {
          if (lockedLetterRef.current !== result.letter) {
            letterHoldStartRef.current = letterHoldStartRef.current || now
          }

          if (
            letterHoldStartRef.current &&
            now - letterHoldStartRef.current >= LETTER_HOLD_MS &&
            lockedLetterRef.current !== result.letter
          ) {
            lockedLetterRef.current = result.letter
            pendingWordRef.current += lockedLetterRef.current
            setPendingWord(pendingWordRef.current)
            letterHoldStartRef.current = null
          }
        } else {
          letterHoldStartRef.current = null
          lockedLetterRef.current = ''
        }

        

				// Inside onResults:
				if (result.letter.toLowerCase() === 'next') {
					if (!nextTimeoutRef.current && pendingWordRef.current.trim()) {
						// Start timeout to commit after NEXT_HOLD_MS
						nextTimeoutRef.current = setTimeout(() => {
							setCommittedSentence((s) =>
								s ? `${s} ${pendingWordRef.current}` : pendingWordRef.current
							)
							pendingWordRef.current = ''
							setPendingWord('')
							lockedLetterRef.current = ''
							nextTimeoutRef.current = null
						}, NEXT_HOLD_MS)
					}
				} else {
					// Hand moved away, cancel the timeout
					if (nextTimeoutRef.current) {
						clearTimeout(nextTimeoutRef.current)
						nextTimeoutRef.current = null
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
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach((t) => t.stop())
      }
    }
  }, [flipped, debugEnabled])

  // ===== PROGRESS BARS =====
  const [letterProgress, setLetterProgress] = useState(0)
  const [nextProgress, setNextProgress] = useState(0)

  useEffect(() => {
    let anim: number
    const updateProgress = () => {
      const now = performance.now()
      setLetterProgress(
        letterHoldStartRef.current
          ? Math.min(((now - letterHoldStartRef.current) / LETTER_HOLD_MS) * 100, 100)
          : 0
      )
      setNextProgress(
        nextHoldStartRef.current
          ? Math.min(((now - nextHoldStartRef.current) / NEXT_HOLD_MS) * 100, 100)
          : 0
      )
      anim = requestAnimationFrame(updateProgress)
    }
    anim = requestAnimationFrame(updateProgress)
    return () => cancelAnimationFrame(anim)
  }, [])

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
        <button onClick={() => setFlipped((f) => !f)} className="btn">
          Flip
        </button>
        <button
          onClick={() => {
            setCommittedSentence((prev) =>
              prev ? `${prev} ${pendingWordRef.current}` : pendingWordRef.current
            )
            pendingWordRef.current = ''
            setPendingWord('')
          }}
          className="btn"
        >
          Commit Word
        </button>
        <button
          onClick={() => {
            setCommittedSentence('')
            pendingWordRef.current = ''
            setPendingWord('')
            setCurrentLetter('—')
            lockedLetterRef.current = ''
            letterHoldStartRef.current = null
            nextHoldStartRef.current = null
          }}
          className="btn"
        >
          Clear
        </button>
        <button onClick={() => setDebugEnabled((d) => !d)} className="btn">
          {debugEnabled ? 'Hide Debug' : 'Show Debug'}
        </button>
      </div>

      <p className="mt-4 bg-white text-black p-2 rounded w-[640px] min-h-[50px]">
        <b>Sentence:</b> {committedSentence}
      </p>

      <p className="mt-2 bg-white text-black p-2 rounded w-[640px] min-h-[40px]">
        <b>Pending Word:</b> {pendingWord}
      </p>

      {/* Hold Progress Bars */}
      <div className="mt-4 w-[640px] space-y-2">
        <div>
          <b>Letter Hold Progress:</b>
          <div className="h-4 bg-white/30 rounded">
            <div
              className="h-4 bg-green-500 rounded"
              style={{ width: `${letterProgress}%` }}
            />
          </div>
        </div>

        <div>
          <b>Next Hold Progress:</b>
          <div className="h-4 bg-white/30 rounded">
            <div
              className="h-4 bg-blue-500 rounded"
              style={{ width: `${nextProgress}%` }}
            />
          </div>
        </div>
      </div>

      <video ref={videoRef} hidden />

      {debugEnabled && debugInfo && (
        <div className="absolute top-2 left-2 bg-black/80 text-white text-xs p-3 rounded w-[350px] space-y-1">
          <div>
            <b>Raw Best:</b> {debugInfo.rawBest}
          </div>
          <div>
            <b>Raw Score:</b> {debugInfo.rawScore}
          </div>
          <div>
            <b>Final:</b> {debugInfo.heuristicOutput}
          </div>
          <div>
            <b>Fired Rules:</b> {debugInfo.firedRules.join(', ')}</div>
          <div>
            <b>Top Distances:</b>{' '}
            {debugInfo.topDistances.map((d) => `${d.letter}:${d.score}`).join(', ')}
          </div>
          {debugInfo.pointDistances && (
            <div>
              <b>Point Distances:</b>{' '}
              {debugInfo.pointDistances.map((d) => `${d.label}:${d.value}`).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
