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
	const nextLockedRef = useRef(false)
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
          // Reset hold start times when no hand detected
          letterHoldStartRef.current = null
          nextHoldStartRef.current = null
          lockedLetterRef.current = ''
          // Cancel pending next timeout if any
          if (nextTimeoutRef.current) {
            clearTimeout(nextTimeoutRef.current)
            nextTimeoutRef.current = null
          }
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

        // ===== LETTER HOLD LOGIC =====
        if (result.letter !== '—' && result.letter.toLowerCase() !== 'next') {
          if (lockedLetterRef.current !== result.letter) {
            // Start hold timer if a new letter
            if (!letterHoldStartRef.current) {
              letterHoldStartRef.current = now
            }
          }
          // Check if hold duration met
          if (
            letterHoldStartRef.current &&
            now - letterHoldStartRef.current >= LETTER_HOLD_MS &&
            lockedLetterRef.current !== result.letter
          ) {
            // Commit the letter
            lockedLetterRef.current = result.letter
            pendingWordRef.current += lockedLetterRef.current
            setPendingWord(pendingWordRef.current)
            // Reset hold start
            letterHoldStartRef.current = null
          }
        } else {
          // No letter or 'next' gesture detected, reset hold timer
          letterHoldStartRef.current = null
          lockedLetterRef.current = ''
        }

				// ===== NEXT HOLD LOGIC (TIMEOUT-BASED, FIXED) =====
				if (result.letter.toLowerCase() === 'next') {
					if (!nextTimeoutRef.current && pendingWordRef.current.trim()) {
						// ✅ CAPTURE the word NOW
						const wordToCommit = pendingWordRef.current

						nextHoldStartRef.current = performance.now()

						nextTimeoutRef.current = setTimeout(() => {
							setCommittedSentence((s) =>
								s ? `${s} ${wordToCommit}` : wordToCommit
							)

							// Clear AFTER commit
							pendingWordRef.current = ''
							setPendingWord('')
							lockedLetterRef.current = ''

							nextTimeoutRef.current = null
							nextHoldStartRef.current = null
						}, NEXT_HOLD_MS)
					}
				} else {
					// Hand moved away → cancel everything
					if (nextTimeoutRef.current) {
						clearTimeout(nextTimeoutRef.current)
						nextTimeoutRef.current = null
					}
					nextHoldStartRef.current = null
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
  <div className="min-h-screen bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] flex items-center justify-center p-6 text-white">
    <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

      {/* ================= CAMERA ================= */}
      <div className="relative rounded-3xl overflow-hidden shadow-2xl bg-black/60 ring-1 ring-white/10 flex justify-center items-center">
        {/* Make canvas larger by setting explicit width/height */}
        <canvas
          ref={canvasRef}
          width={480} // Larger width
          height={640} // Larger height
          className="w-[90%] max-w-[1200px] h-auto"
        />

        {/* CURRENT LETTER */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <div className="px-16 py-8 rounded-full bg-gradient-to-br from-white to-gray-200 text-black text-7xl font-black tracking-widest shadow-[0_0_40px_rgba(255,255,255,0.4)]">
            {currentLetter}
          </div>
        </div>
      </div>

      {/* ================= SIDE PANEL ================= */}
      <div className="flex flex-col gap-6 bg-black/40 backdrop-blur-xl rounded-3xl p-6 shadow-xl ring-1 ring-white/10 max-w-md">
        {/* TITLE */}
        <div>
          <h1 className="text-3xl font-bold tracking-wide">
            🤚 Gesture Translator
          </h1>
          <p className="text-sm opacity-60">
            Hold letter · Hold <b>NEXT</b> to commit word
          </p>
        </div>

        {/* ================= PROGRESS ================= */}
        <div className="space-y-4">
          {/* Hold Progress Bars */}
          <div className="mt-4 w-full space-y-2">
            <div>
              <b>Letter Hold Progress:</b>
              <div className="h-4 bg-white/30 rounded overflow-hidden">
                <div
                  className="h-4 bg-green-500 rounded"
                  style={{ width: `${letterProgress}%` }}
                />
              </div>
            </div>

            <div>
              <b>Next Hold Progress:</b>
              <div className="h-4 bg-white/30 rounded overflow-hidden">
                <div
                  className="h-4 bg-blue-500 rounded"
                  style={{ width: `${nextProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ================= TEXT ================= */}
        <div className="space-y-3">
          <div className="rounded-xl p-3 bg-white/5 ring-1 ring-white/10">
            <p className="text-xs opacity-60">Sentence</p>
            <p className="text-lg font-semibold break-words">
              {committedSentence || '—'}
            </p>
          </div>

          <div className="rounded-xl p-3 bg-white/5 ring-1 ring-white/10">
            <p className="text-xs opacity-60">Pending Word</p>
            <p className="font-mono text-2xl tracking-widest">
              {pendingWord || '—'}
            </p>
          </div>
        </div>

        {/* ================= CONTROLS ================= */}
        <div className="grid grid-cols-2 gap-3 pt-2">

          {/* BACKSPACE */}
          <button
            onClick={() => {
              if (!pendingWordRef.current) return
              pendingWordRef.current =
                pendingWordRef.current.slice(0, -1)
              setPendingWord(pendingWordRef.current)
              lockedLetterRef.current = ''
            }}
            className="rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 hover:scale-[1.02] transition font-bold text-black py-2"
          >
            ⌫ Backspace
          </button>

          {/* FLIP */}
          <button
            onClick={() => setFlipped((f) => !f)}
            className="rounded-xl bg-white/10 hover:bg-white/20 transition py-2"
          >
            Flip
          </button>

          {/* DEBUG */}
          <button
            onClick={() => setDebugEnabled((d) => !d)}
            className="rounded-xl bg-white/10 hover:bg-white/20 transition py-2"
          >
            {debugEnabled ? 'Hide Debug' : 'Show Debug'}
          </button>

          {/* COMMIT */}
          <button
            onClick={() => {
              if (!pendingWordRef.current.trim()) return
              setCommittedSentence((s) =>
                s ? `${s} ${pendingWordRef.current}` : pendingWordRef.current
              )
              pendingWordRef.current = ''
              setPendingWord('')
              lockedLetterRef.current = ''
            }}
            className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 hover:scale-[1.02] transition font-bold py-2"
          >
            Commit Word
          </button>

          {/* CLEAR */}
          <button
            onClick={() => {
              setCommittedSentence('')
              pendingWordRef.current = ''
              setPendingWord('')
              setCurrentLetter('—')
              lockedLetterRef.current = ''
            }}
            className="col-span-2 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 hover:scale-[1.02] transition font-bold py-2"
          >
            Clear All
          </button>
        </div>
      </div>

      <video ref={videoRef} hidden />
    </div>
  </div>
)
}