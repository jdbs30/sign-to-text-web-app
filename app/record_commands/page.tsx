'use client'

import { useEffect, useRef, useState } from 'react'
import { detectChar } from '@/utils/detectChar'
import type { DebugInfo } from '@/utils/detectChar'
import type { Point } from '@/utils/handTypes'
import TopNav from '@/components/topNav'
import api from '@/lib/api'

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

  // ===== RECORDING =====
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<BlobPart[]>([])
  const recordedBlobRef = useRef<Blob | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)

  // ===== TEXT =====
  const [currentLetter, setCurrentLetter] = useState('—')
  const [pendingWord, setPendingWord] = useState('')
  const [committedSentence, setCommittedSentence] = useState('')

  // ===== DEBUG =====
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [flipped, setFlipped] = useState(false)

  // ===== PROGRESS =====
  const [letterProgress, setLetterProgress] = useState(0)
  const [nextProgress, setNextProgress] = useState(0)

  // ===== HOLD REFS =====
  const letterHoldStartRef = useRef<number | null>(null)
  const nextHoldStartRef = useRef<number | null>(null)
  const lockedLetterRef = useRef<string>('')
  const pendingWordRef = useRef<string>('')

  // ================= RECORD CONTROLS =================
  const startRecording = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    recordedChunksRef.current = []

    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm; codecs=vp9',
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      recordedBlobRef.current = blob
      setRecordedUrl(URL.createObjectURL(blob))
    }

    recorder.start()
    mediaRecorderRef.current = recorder
    setIsRecording(true)
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setIsRecording(false)
  }

  // ================= UPLOAD =================
  const uploadRecording = async () => {
    if (!recordedBlobRef.current) {
      alert('No recording to upload')
      return
    }

    try {
      const formData = new FormData()
      formData.append(
        'files',
        recordedBlobRef.current,
        `gesture-${Date.now()}.webm`
      )

      const uploadRes = await api.post('/api/upload', formData)
      const fileId = uploadRes.data[0].id

      await api.post('/api/saved-signs', {
        data: {
          sentence: committedSentence,
          video: fileId,
        },
      })

      alert('✅ Recording saved')

      recordedBlobRef.current = null
      setRecordedUrl(null)
      setCommittedSentence('')
      setPendingWord('')
    } catch (err) {
      console.error(err)
      alert('❌ Upload failed')
    }
  }

  // ================= MEDIAPIPE =================
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

        if (!results.multiHandLandmarks?.length) {
          letterHoldStartRef.current = null
          nextHoldStartRef.current = null
          lockedLetterRef.current = ''
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

        // ===== LETTER BUBBLE =====
        ctx.save()
        ctx.font = '900 96px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const paddingX = 60
        const paddingY = 40
        const metrics = ctx.measureText(result.letter)
        const boxW = metrics.width + paddingX * 2
        const boxH = 96 + paddingY * 2

        const x = canvas.width / 2
        const y = canvas.height - boxH / 2 - 30

        ctx.shadowColor = 'rgba(255,255,255,0.4)'
        ctx.shadowBlur = 40
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.roundRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 80)
        ctx.fill()

        ctx.shadowBlur = 0
        ctx.fillStyle = '#000'
        ctx.fillText(result.letter, x, y)
        ctx.restore()

        const now = performance.now()

        // ===== LETTER HOLD =====
        if (result.letter !== '—' && result.letter.toLowerCase() !== 'next') {
          if (!letterHoldStartRef.current) letterHoldStartRef.current = now
          if (
            now - letterHoldStartRef.current >= LETTER_HOLD_MS &&
            lockedLetterRef.current !== result.letter
          ) {
            lockedLetterRef.current = result.letter
            pendingWordRef.current += result.letter
            setPendingWord(pendingWordRef.current)
            letterHoldStartRef.current = null
          }
        } else {
          letterHoldStartRef.current = null
          lockedLetterRef.current = ''
        }

        // ===== NEXT HOLD =====
        if (result.letter.toLowerCase() === 'next') {
          if (!nextTimeoutRef.current && pendingWordRef.current.trim()) {
            const word = pendingWordRef.current
            nextHoldStartRef.current = now
            nextTimeoutRef.current = setTimeout(() => {
              setCommittedSentence((s) => (s ? `${s} ${word}` : word))
              pendingWordRef.current = ''
              setPendingWord('')
              lockedLetterRef.current = ''
              nextTimeoutRef.current = null
              nextHoldStartRef.current = null
            }, NEXT_HOLD_MS)
          }
        } else if (nextTimeoutRef.current) {
          clearTimeout(nextTimeoutRef.current)
          nextTimeoutRef.current = null
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
      mediaRecorderRef.current?.stop()
      if (videoRef.current?.srcObject) {
        ;(videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop())
      }
    }
  }, [flipped, debugEnabled])

  // ================= PROGRESS ANIMATION =================
  useEffect(() => {
    let anim: number
    const update = () => {
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
      anim = requestAnimationFrame(update)
    }
    anim = requestAnimationFrame(update)
    return () => cancelAnimationFrame(anim)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] flex items-center justify-center p-6 text-white">
      <TopNav />

      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        <div className="relative rounded-3xl overflow-hidden shadow-2xl bg-black/60 ring-1 ring-white/10 flex justify-center items-center">
          <canvas ref={canvasRef} className="w-[90%] max-w-[1200px] h-auto" />
        </div>

        <div className="flex flex-col gap-6 bg-black/40 backdrop-blur-xl rounded-3xl p-6 shadow-xl ring-1 ring-white/10 max-w-md">
          <h1 className="text-3xl font-bold">🤚 Gesture Translator</h1>

          {/* SENTENCE */}
          <div className="space-y-2">
            <div>
              <p className="text-xs opacity-60">Sentence</p>
              <p className="text-lg font-semibold">{committedSentence || '—'}</p>
            </div>
            <div>
              <p className="text-xs opacity-60">Pending Word</p>
              <p className="font-mono text-2xl">{pendingWord || '—'}</p>
            </div>
          </div>

          {/* PROGRESS BARS */}
          <div className="space-y-3">
            <div>
              <b>Letter Hold Progress</b>
              <div className="h-4 bg-white/30 rounded">
                <div
                  className="h-4 bg-green-500 rounded"
                  style={{ width: `${letterProgress}%` }}
                />
              </div>
            </div>
            <div>
              <b>Next Hold Progress</b>
              <div className="h-4 bg-white/30 rounded">
                <div
                  className="h-4 bg-blue-500 rounded"
                  style={{ width: `${nextProgress}%` }}
                />
              </div>
            </div>
          </div>

          {/* CONTROLS */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setFlipped((f) => !f)} className="bg-white/10 rounded-xl py-2">
              Flip
            </button>
            <button onClick={() => setDebugEnabled((d) => !d)} className="bg-white/10 rounded-xl py-2">
              {debugEnabled ? 'Hide Debug' : 'Show Debug'}
            </button>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`col-span-2 rounded-xl font-bold py-2 ${
                isRecording
                  ? 'bg-gradient-to-br from-red-500 to-rose-600'
                  : 'bg-gradient-to-br from-emerald-400 to-green-600'
              }`}
            >
              {isRecording ? '⏹ Stop Recording' : '⏺ Start Recording'}
            </button>

            {recordedUrl && (
              <button
                onClick={uploadRecording}
                className="col-span-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 font-bold py-2"
              >
                💾 Save Recording
              </button>
            )}
          </div>
        </div>

        <video ref={videoRef} hidden />
      </div>
    </div>
  )
}
