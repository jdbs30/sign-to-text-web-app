'use client'

import { useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import type { Point } from '@/utils/handTypes'
import { detectChar } from '@/utils/detectChar'
import TopNav from '@/components/topNav'
import api from '@/lib/api' // Assuming you have an API client

declare global {
  interface Window {
    Hands: any
    Holistic: any
    Camera: any
    ControlUtils: any
    DrawingUtils: any
    drawLandmarks: any
    drawConnectors: any
  }
}

const LETTER_HOLD_MS = 2000
const NEXT_HOLD_MS = 2000
const SMOOTHING_BUFFER_SIZE = 5
const DETECTION_THROTTLE_MS = 50

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modelRef = useRef<tf.LayersModel | null>(null)
  const labelsRef = useRef<string[]>([])
  const currentModelRef = useRef<'gesture' | 'alphabet'>('gesture')
  const holisticRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const currentWordRef = useRef('')

  // ===== RECORDING =====
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<BlobPart[]>([])
  const recordedBlobRef = useRef<Blob | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const POST_NEXT_COOLDOWN_MS = 700
  const postNextCooldownRef = useRef<number>(0)

  const [currentModel, setCurrentModel] = useState<'gesture' | 'alphabet'>('gesture')
  const [labels, setLabels] = useState<string[]>([])
  const [isModelLoading, setIsModelLoading] = useState(true)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentLetter, setCurrentLetter] = useState('—')
  const [sentence, setSentence] = useState('')
  const [currentWord, setCurrentWord] = useState('')
  const [flipped, setFlipped] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(true)

  // Hold refs
  const letterHoldStartRef = useRef<number | null>(null)
  const nextHoldStartRef = useRef<number | null>(null)
  const lockedLetterRef = useRef<string>('')
  const smoothingBufferRef = useRef<string[]>([])
  const lastDetectionTimeRef = useRef<number>(0)
  const isRenderingRef = useRef<boolean>(false)

  // ================== RECORDING FUNCTIONS ==================
  const startRecording = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    recordedChunksRef.current = []
    
    // Capture canvas stream
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data)
      }
    }

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      recordedBlobRef.current = blob
      const url = URL.createObjectURL(blob)
      setRecordedUrl(url)
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

  // ================== UPLOAD ==================
  const uploadRecording = async () => {
    if (!recordedBlobRef.current) {
      alert('No recording to upload')
      return
    }

    if (!sentence.trim()) {
      alert('Please add some text to the sentence before saving')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append(
        'files',
        recordedBlobRef.current,
        `gesture-${Date.now()}.webm`
      )

      // Show upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 10
        })
      }, 300)

      // First upload the video file to get the file ID
      const uploadRes = await api.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setUploadProgress(progress)
          }
        },
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      const fileId = uploadRes.data[0].id

      // Then save the recording metadata
      await api.post('/api/saved-signs', {
        data: {
          sentence: sentence,
          video: fileId,
        },
      })

      alert('✅ Recording saved to database!')

      // Reset after successful save
      recordedBlobRef.current = null
      setRecordedUrl(null)
      recordedChunksRef.current = []
      setSentence('')
      setCurrentWord('')
      currentWordRef.current = ''
      
      // Delay to show 100% progress
      setTimeout(() => {
        setIsUploading(false)
        setUploadProgress(0)
      }, 1000)

    } catch (err: any) {
      console.error('Upload error:', err)
      
      const errorMessage = err.response?.data?.error || 
                          err.message || 
                          'Upload failed. Please try again.'
      
      alert(`❌ ${errorMessage}`)
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  // Also add this function for downloading recordings
  const downloadRecording = () => {
    if (!recordedBlobRef.current) {
      alert('No recording available')
      return
    }

    const url = URL.createObjectURL(recordedBlobRef.current)
    const a = document.createElement('a')
    a.href = url
    a.download = `gesture-recording-${Date.now()}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const clearRecording = () => {
    recordedBlobRef.current = null
    setRecordedUrl(null)
    recordedChunksRef.current = []
  }

  // ================== UTILITIES ==================
  const getMostFrequentLabel = (arr: string[]) => {
    if (!arr.length) return '—'
    const freq: Record<string, number> = {}
    arr.forEach(l => {
      if (l && l !== '—') {
        freq[l] = (freq[l] || 0) + 1
      }
    })
    
    if (Object.keys(freq).length === 0) return '—'
    
    let maxCount = 0
    let result = arr[0]
    for (const key in freq) {
      if (freq[key] > maxCount) {
        maxCount = freq[key]
        result = key
      }
    }
    return result
  }

  const convertLandmarksToPoints = (landmarks: any[]): Point[] =>
    landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z || 0 }))

  // ================== DRAWING ==================
  const drawLetterBubble = (ctx: CanvasRenderingContext2D, text: string, width: number, height: number) => {
    if (!text || text === '—') return
    
    ctx.save()
    const paddingX = 80
    const paddingY = 50
    const fontSize = 96
    
    ctx.font = `900 ${fontSize}px system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    const boxWidth = 180
    const boxHeight = fontSize + paddingY * 2
    const x = width / 2
    const y = height - boxHeight / 2 - 50

    ctx.shadowColor = 'rgba(255,255,255,0.4)'
    ctx.shadowBlur = 40
    ctx.fillStyle = '#ffffff'
    
    ctx.beginPath()
    const radius = 80
    ctx.moveTo(x - boxWidth/2 + radius, y - boxHeight/2)
    ctx.arcTo(x + boxWidth/2, y - boxHeight/2, x + boxWidth/2, y + boxHeight/2, radius)
    ctx.arcTo(x + boxWidth/2, y + boxHeight/2, x - boxWidth/2, y + boxHeight/2, radius)
    ctx.arcTo(x - boxWidth/2, y + boxHeight/2, x - boxWidth/2, y - boxHeight/2, radius)
    ctx.arcTo(x - boxWidth/2, y - boxHeight/2, x + boxWidth/2, y - boxHeight/2, radius)
    ctx.closePath()
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.fillStyle = '#000000'
    ctx.fillText(text, x, y)
    ctx.restore()
  }

  const drawLandmarksIfPresent = (results: any, ctx: CanvasRenderingContext2D) => {
    if (results.leftHandLandmarks) {
      window.drawConnectors(ctx, results.leftHandLandmarks, window.Hands.HAND_CONNECTIONS, {color:'#858585', lineWidth:2})
      window.drawLandmarks(ctx, results.leftHandLandmarks, {color:'#f77979', lineWidth:1})
    }
    if (results.rightHandLandmarks) {
      window.drawConnectors(ctx, results.rightHandLandmarks, window.Hands.HAND_CONNECTIONS, {color:'#858585', lineWidth:2})
      window.drawLandmarks(ctx, results.rightHandLandmarks, {color:'#f0a66e', lineWidth:1})
    }
  }

  // ================== ML PREDICTION ==================
  const predictModel = async (input: tf.Tensor) => {
    const m = modelRef.current
    const lbls = labelsRef.current
    if (!m || !lbls.length) { 
      input.dispose()
      return '—' 
    }
    try {
      const pred = m.predict(input) as tf.Tensor
      const arr = await pred.array() as number[][]
      const maxIndex = arr[0].indexOf(Math.max(...arr[0]))
      const result = lbls[maxIndex] || '—'
      input.dispose()
      pred.dispose()
      return result
    } catch(e) { 
      console.error('Prediction error:', e)
      return '—' 
    }
  }

  // ================== HOLD LOGIC ==================
  const processAlphabetHoldLogic = (
    label: string,
    landmarks: Point[] | null
  ) => {
    if (!landmarks) return

    const now = performance.now()

    // 🚫 BLOCK LETTERS AFTER NEXT
    if (
      postNextCooldownRef.current > 0 &&
      now - postNextCooldownRef.current < POST_NEXT_COOLDOWN_MS
    ) {
      return
    }

    const isNext = label === 'next'

    // ================= NEXT LOGIC =================
    if (isNext) {
      // kill any letter logic instantly
      letterHoldStartRef.current = null
      lockedLetterRef.current = ''

      if (!nextHoldStartRef.current) {
        nextHoldStartRef.current = now
        lockedLetterRef.current = '⏭️'
        return
      }

      if (now - nextHoldStartRef.current >= NEXT_HOLD_MS) {
        // Check if there's a current word to add to sentence
        if (currentWordRef.current) {
          setSentence(prev => {
            const newSentence = prev ? prev + ' ' + currentWordRef.current : currentWordRef.current
            console.log(`Word "${currentWordRef.current}" added to sentence. New sentence: "${newSentence}"`)
            return newSentence
          })
          setCurrentWord('') // Clear the current word state
          currentWordRef.current = '' // Clear the ref
          postNextCooldownRef.current = now
        }

        nextHoldStartRef.current = null
        lockedLetterRef.current = ''
        smoothingBufferRef.current = []
        setCurrentLetter('—')
      }

      return
    }

    // reset next if not holding
    nextHoldStartRef.current = null

    // ================= LETTER LOGIC =================
    if (label === '—' || label === 'next') return

    if (lockedLetterRef.current !== label) {
      letterHoldStartRef.current = now
      lockedLetterRef.current = label
      return
    }

    if (
      letterHoldStartRef.current &&
      now - letterHoldStartRef.current >= LETTER_HOLD_MS
    ) {
      // Add letter to both state and ref
      const newWord = currentWord + lockedLetterRef.current
      setCurrentWord(newWord)
      currentWordRef.current = newWord // Update ref with latest word
      console.log(`Letter "${lockedLetterRef.current}" added. Current word: "${newWord}"`)

      letterHoldStartRef.current = null
      lockedLetterRef.current = ''
      smoothingBufferRef.current = []
      setCurrentLetter('—')
    }
  }

  const processGestureHoldLogic = (label: string) => {
    if (label === '—') {
      letterHoldStartRef.current = null
      lockedLetterRef.current = ''
      return
    }

    const now = performance.now()
    
    if (lockedLetterRef.current !== label) {
      letterHoldStartRef.current = now
      lockedLetterRef.current = label
      return
    }

    if (letterHoldStartRef.current && now - letterHoldStartRef.current >= LETTER_HOLD_MS) {
      setSentence(prev => (prev ? prev + ' ' : '') + lockedLetterRef.current)
      console.log(`Gesture "${lockedLetterRef.current}" added to sentence`)
      letterHoldStartRef.current = null
      lockedLetterRef.current = ''
      smoothingBufferRef.current = []
      setCurrentLetter('—')
    }
  }

  // ================== DRAW FRAME ==================
  const drawFrame = (results: any, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (flipped) {
      ctx.save()
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height)
      ctx.restore()
    } else {
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height)
    }

    drawLandmarksIfPresent(results, ctx)
    drawLetterBubble(ctx, currentLetter, canvas.width, canvas.height)

    const now = performance.now()

    // LETTER progress bar (never for ⏭️)
    if (
      letterHoldStartRef.current &&
      lockedLetterRef.current &&
      lockedLetterRef.current !== '⏭️'
    ) {
      const holdDuration = now - letterHoldStartRef.current
      const progress = Math.min((holdDuration / LETTER_HOLD_MS) * 100, 100)

      ctx.save()
      ctx.fillStyle = '#3B82F6'
      ctx.fillRect(0, canvas.height - 20, (canvas.width * progress) / 100, 10)

      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(
        `Hold to add "${lockedLetterRef.current}" to word`,
        canvas.width / 2,
        canvas.height - 30
      )
      ctx.restore()
    }

    
    // Next gesture hold progress bar (alphabet mode only)
    if (currentModelRef.current === 'alphabet' && nextHoldStartRef.current) {
      const d = now - nextHoldStartRef.current
      const p = Math.min((d / NEXT_HOLD_MS) * 100, 100)

      ctx.save()
      ctx.fillStyle = '#10B981'
      ctx.fillRect(0, canvas.height - 40, (canvas.width * p) / 100, 10)

      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(
        'Hold ⏭️ to add word to sentence',
        canvas.width / 2,
        canvas.height - 50
      )
      ctx.restore()
    }

    // Recording indicator
    if (isRecording) {
      ctx.save()
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'
      ctx.beginPath()
      ctx.arc(30, 30, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'white'
      ctx.font = 'bold 14px Arial'
      ctx.fillText('REC', 50, 35)
      ctx.restore()
    }
  }

  // ================== ALPHABET DETECTION ==================
  const processAlphabetDetection = async (results: any, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const hasLeft = results.leftHandLandmarks?.length >= 21
    const hasRight = results.rightHandLandmarks?.length >= 21

    let detectedLandmarks: Point[] | null = null
    let rawLabel = '—'

    // Check right hand first (for Next gesture)
    if (hasRight) {
      const rhPoints = convertLandmarksToPoints(results.rightHandLandmarks)
      const detectionResult = detectChar(rhPoints)
      
      if (detectionResult.letter === 'next') {
        rawLabel = 'next'
        detectedLandmarks = rhPoints
      }
    }
    
    // Check left hand for Next gesture
    if (!detectedLandmarks && hasLeft) {
      const lhPoints = convertLandmarksToPoints(results.leftHandLandmarks)
      const detectionResult = detectChar(lhPoints)
      
      if (detectionResult.letter === 'next') {
        rawLabel = 'next'
        detectedLandmarks = lhPoints
      }
    }

    // If not Next gesture, try alphabet detection
    if (rawLabel === '—' && hasLeft) {
      const lhPoints = convertLandmarksToPoints(results.leftHandLandmarks)
      const rhPoints = hasRight ? convertLandmarksToPoints(results.rightHandLandmarks) : Array(21).fill({x:0,y:0,z:0})
      const landmark_list = lhPoints.map((l,i)=>[l.x,l.y,rhPoints[i]?.x||0,rhPoints[i]?.y||0])
      rawLabel = await predictModel(tf.tensor([landmark_list]))
      detectedLandmarks = lhPoints
    }

    if (rawLabel === '—' && hasRight) {
      const rhPoints = convertLandmarksToPoints(results.rightHandLandmarks)
      const heuristicResult = detectChar(rhPoints)
      const heuristicLabel = heuristicResult.letter
      
      if (heuristicLabel && heuristicLabel !== 'next' && heuristicLabel !== '—') {
        rawLabel = heuristicLabel
      } else {
        const lhPoints = Array(21).fill({x:0,y:0,z:0})
        const landmark_list = lhPoints.map((l,i)=>[l.x,l.y,rhPoints[i]?.x||0,rhPoints[i]?.y||0])
        rawLabel = await predictModel(tf.tensor([landmark_list]))
      }
      detectedLandmarks = rhPoints
    }

    if (!detectedLandmarks) {
      postNextCooldownRef.current = 0
      smoothingBufferRef.current = []
      letterHoldStartRef.current = null
      nextHoldStartRef.current = null
      lockedLetterRef.current = ''
      setCurrentLetter('—')
      drawFrame(results, ctx, canvas)
      return
    }


    smoothingBufferRef.current.push(rawLabel)
    if (smoothingBufferRef.current.length > SMOOTHING_BUFFER_SIZE) {
      smoothingBufferRef.current = smoothingBufferRef.current.slice(-SMOOTHING_BUFFER_SIZE)
    }
    
    const smoothedLabel = getMostFrequentLabel(smoothingBufferRef.current)
    const displayLabel = smoothedLabel === 'next' ? '⏭️' : smoothedLabel
    setCurrentLetter(displayLabel)

    
    processAlphabetHoldLogic(smoothedLabel, detectedLandmarks)
    drawFrame(results, ctx, canvas)
  }

  // ================== GESTURE DETECTION ==================
  const processGestureDetection = async (results: any, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const hasLeft = results.leftHandLandmarks?.length >= 21
    const hasRight = results.rightHandLandmarks?.length >= 21

    if (!hasLeft && !hasRight) {
      smoothingBufferRef.current = []
      letterHoldStartRef.current = null
      lockedLetterRef.current = ''
      setCurrentLetter('—')
      drawFrame(results, ctx, canvas)
      return
    }

    let landmark_list: number[][] = []
    
    if (hasLeft) {
      const lhPoints = convertLandmarksToPoints(results.leftHandLandmarks)
      const rhPoints = hasRight ? convertLandmarksToPoints(results.rightHandLandmarks) : Array(21).fill({x:0,y:0,z:0})
      landmark_list = lhPoints.map((l,i)=>[l.x,l.y,rhPoints[i].x,rhPoints[i].y])
    } else if (hasRight) {
      const rhPoints = convertLandmarksToPoints(results.rightHandLandmarks)
      const lhPoints = Array(21).fill({x:0,y:0,z:0})
      landmark_list = lhPoints.map((l,i)=>[l.x,l.y,rhPoints[i].x,rhPoints[i].y])
    }

    const rawLabel = await predictModel(tf.tensor([landmark_list]))
    smoothingBufferRef.current.push(rawLabel)
    
    if (smoothingBufferRef.current.length > SMOOTHING_BUFFER_SIZE) {
      smoothingBufferRef.current = smoothingBufferRef.current.slice(-SMOOTHING_BUFFER_SIZE)
    }
    
    const smoothedLabel = getMostFrequentLabel(smoothingBufferRef.current)
    setCurrentLetter(smoothedLabel)
    
    processGestureHoldLogic(smoothedLabel)
    drawFrame(results, ctx, canvas)
  }

  // ================== ON RESULTS ==================
  const onResults = (results: any) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const now = Date.now()
    if (now - lastDetectionTimeRef.current < DETECTION_THROTTLE_MS) {
      drawFrame(results, ctx, canvas)
      return
    }
    
    lastDetectionTimeRef.current = now

    if (isRenderingRef.current) {
      drawFrame(results, ctx, canvas)
      return
    }

    isRenderingRef.current = true

    try {
      if (currentModelRef.current === 'gesture') {
        processGestureDetection(results, ctx, canvas)
      } else {
        processAlphabetDetection(results, ctx, canvas)
      }
    } catch(error) {
      console.error('Detection error:', error)
      drawFrame(results, ctx, canvas)
    } finally {
      setTimeout(() => {
        isRenderingRef.current = false
      }, 0)
    }
  }
  // Add this useEffect to sync the ref with state
  useEffect(() => {
    currentWordRef.current = currentWord
  }, [currentWord])
  // ================== CAMERA + MODEL LOADING ==================
  useEffect(() => {
    let isMounted = true
    const loadModel = async () => {
      setIsModelLoading(true)
      try {
        if (currentModel === 'gesture') {
          const m = await tf.loadLayersModel('/model/gestures/model.json')
          const lbls = ['eat','friend','Hello','Help me','Home','how','Love You','my','name','No','Some','Sorry','Thanks','Understand','Yes']
          modelRef.current = m; labelsRef.current = lbls; setLabels(lbls)
        } else {
          modelRef.current = null; labelsRef.current = []
        }
      } catch(e) { 
        console.error(e); 
        setError('Failed to load model') 
      } finally { 
        setIsModelLoading(false) 
      }
    }
    loadModel()
  }, [currentModel])

  useEffect(() => {
    currentModelRef.current = currentModel
  }, [currentModel])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      try {
        const scripts = [
          'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
          'https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js',
          'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
          'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
          'https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js',
        ]
        
        for (const src of scripts) {
          if (!document.querySelector(`script[src="${src}"]`)) {
            await new Promise<void>(resolve => {
              const s = document.createElement('script')
              s.src = src
              s.onload = () => resolve()
              s.onerror = () => resolve()
              document.body.appendChild(s)
            })
          }
        }

        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas) return

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        })
        
        if (!isMounted) { 
          stream.getTracks().forEach(t => t.stop())
          return 
        }
        
        streamRef.current = stream
        video.srcObject = stream

        await new Promise<void>(resolve => {
          const onLoaded = () => { 
            video.removeEventListener('loadeddata', onLoaded)
            canvas.width = 640
            canvas.height = 480
            setIsVideoReady(true)
            resolve()
          }
          video.addEventListener('loadeddata', onLoaded)
          setTimeout(() => { 
            if (video.videoWidth > 0) { 
              canvas.width = 640
              canvas.height = 480
              setIsVideoReady(true)
              resolve()
            } 
          }, 1000)
        })

        const holistic = new window.Holistic({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
        })
        
        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineFaceLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        
        holistic.onResults(onResults)
        await holistic.initialize()
        holisticRef.current = holistic

        const camera = new window.Camera(video, {
          onFrame: () => {
            if (holisticRef.current && !isRenderingRef.current) {
              holisticRef.current.send({ image: video })
            }
          },
          width: 640,
          height: 480
        })
        
        camera.start()
        cameraRef.current = camera
        setIsCameraOn(true)

      } catch(e) { 
        console.error(e)
        setError('Failed to initialize camera') 
      }
    }
    
    init()
    return () => { 
      isMounted = false
      cameraRef.current?.stop()
      holisticRef.current?.close()
      streamRef.current?.getTracks().forEach(t => t.stop())
      const video = videoRef.current
      if (video) video.srcObject = null
      // Stop recording if active
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [flipped])

  // ================== CONTROLS ==================
  const handleSpace = () => { 
    setSentence(prev => prev + ' ')
  }
  
  const handleClear = () => {
    setSentence('')
    setCurrentWord('')
    currentWordRef.current = ''
    smoothingBufferRef.current = []
    letterHoldStartRef.current = null
    nextHoldStartRef.current = null
    lockedLetterRef.current = ''
    setCurrentLetter('—')
  }
  
  const handleBackspace = () => {
    if (sentence.length > 0) {
      setSentence(prev => prev.slice(0, -1))
    }
  }
  
  const handleWordSpace = () => {
    if (currentWord) {
      setSentence(prev => prev ? prev + ' ' + currentWord : currentWord)
      setCurrentWord('')
      currentWordRef.current = ''
    }
  }
  
  const toggleModel = () => { 
    setCurrentModel(prev => prev === 'alphabet' ? 'gesture' : 'alphabet')
    smoothingBufferRef.current = []
    letterHoldStartRef.current = null
    nextHoldStartRef.current = null
    lockedLetterRef.current = ''
    setCurrentLetter('—')
  }
  
  const toggleCamera = () => { 
    if (cameraRef.current) {
      if (isCameraOn) {
        cameraRef.current.stop()
      } else {
        cameraRef.current.start()
      }
      setIsCameraOn(!isCameraOn)
    }
  }

  const toggleFlip = () => {
    setFlipped(prev => !prev)
  }

  // ================== RENDER ==================
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] flex items-center justify-center p-6 text-white">
      <TopNav/>
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        <div className="relative rounded-3xl overflow-hidden shadow-2xl bg-black/60 ring-1 ring-white/10 flex justify-center items-center">
          <canvas 
            ref={canvasRef} 
            width={640} 
            height={480} 
            className="w-[90%] max-w-[640px] h-auto bg-black"
            style={{ transform: flipped ? 'scaleX(-1)' : 'none' }}
          />
          {(!isVideoReady || isModelLoading) && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-xl">{isModelLoading?'Loading model...':'Initializing camera...'}</div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4">
              <div className="text-xl text-red-300 mb-4">{error}</div>
              <button onClick={()=>window.location.reload()} className="px-4 py-2 bg-blue-500 rounded-lg hover:bg-blue-600 transition">
                Retry Camera
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 bg-black/40 backdrop-blur-xl rounded-3xl p-6 shadow-xl ring-1 ring-white/10 max-w-md">
          <h1 className="text-3xl font-bold mt-16">🤚 Gesture Translator</h1>
          
          {/* Recording Controls */}
          <div className="p-3 bg-white/5 rounded-xl">
            <p className="text-xs opacity-60 mb-2">Recording</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={`rounded-xl py-3 font-bold transition ${
                  isRecording 
                    ? 'bg-gradient-to-r from-red-500 to-red-600' 
                    : 'bg-gradient-to-r from-green-500 to-emerald-600'
                }`}
                disabled={isUploading}
              >
                {isRecording ? '⏹ Stop Recording' : '⏺ Start Recording'}
              </button>
              
              {recordedUrl && (
                <>
                  {isUploading ? (
                    <div className="space-y-2">
                      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-center text-sm">
                        {uploadProgress < 100 ? 'Uploading...' : 'Processing...'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button 
                          onClick={downloadRecording}
                          className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 py-2 font-bold"
                          disabled={isUploading}
                        >
                          📥 Download
                        </button>
                        <button 
                          onClick={clearRecording}
                          className="flex-1 rounded-xl bg-gradient-to-r from-gray-500 to-gray-700 py-2 font-bold"
                          disabled={isUploading}
                        >
                          🗑️ Clear
                        </button>
                      </div>
                      
                      <button 
                        onClick={uploadRecording}
                        className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-600 py-3 font-bold"
                        disabled={isUploading}
                      >
                        💾 Save to Database
                      </button>
                    </div>
                  )}
                  
                  <div className="mt-2">
                    <p className="text-xs opacity-60">Preview:</p>
                    <video 
                      src={recordedUrl} 
                      controls 
                      className="w-full rounded-lg mt-1 max-h-48"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="p-3 bg-white/5 rounded-xl">
            <p className="text-xs opacity-60">Current Model</p>
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold">{currentModel==='gesture'?'Gesture Model':'Alphabet Model'}</p>
              <button 
                onClick={toggleModel} 
                className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20 transition"
                disabled={isUploading}
              >
                {currentModel==='gesture'?'Switch to Alphabet':'Switch to Gesture'}
              </button>
            </div>
          </div>
          <div className="p-4 bg-white/5 rounded-xl text-center">
            <p className="text-xs opacity-60">Current Detection</p>
            <p className="text-4xl font-bold min-h-[3rem]">{currentLetter}</p>
          </div>
          
          {currentModel === 'alphabet' && (
            <div className="p-3 bg-white/5 rounded-xl">
              <p className="text-xs opacity-60">Current Word</p>
              <p className="text-lg font-semibold min-h-[2rem] break-words">
                {currentWord || '—'}
              </p>
            </div>
          )}
          
          <div className="p-3 bg-white/5 rounded-xl">
            <p className="text-xs opacity-60">Sentence</p>
            <p className="text-lg font-semibold min-h-[2rem] break-words">
              {sentence || '—'}
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={handleSpace} 
              className="rounded-xl bg-white/10 py-2 hover:bg-white/20 transition"
              disabled={isUploading}
            >
              Space
            </button>
            <button 
              onClick={handleClear} 
              className="rounded-xl bg-white/10 py-2 hover:bg-white/20 transition"
              disabled={isUploading}
            >
              Clear All
            </button>
            <button 
              onClick={handleBackspace} 
              className="rounded-xl bg-white/10 py-2 hover:bg-white/20 transition"
              disabled={isUploading}
            >
              Backspace
            </button>
            {currentModel === 'alphabet' && (
              <button 
                onClick={handleWordSpace} 
                className="rounded-xl bg-white/10 py-2 hover:bg-white/20 transition"
                disabled={isUploading}
              >
                Add Word
              </button>
            )}
            <button 
              onClick={toggleCamera} 
              className="rounded-xl bg-white/10 py-2 hover:bg-white/20 transition"
              disabled={isUploading}
            >
              {isCameraOn?'Stop Camera':'Start Camera'}
            </button>
            <button 
              onClick={toggleFlip} 
              className="rounded-xl bg-white/10 py-2 hover:bg-white/20 transition"
              disabled={isUploading}
            >
              {flipped?'Unflip':'Flip'}
            </button>
          </div>
          
          <div className="p-3 bg-white/5 rounded-xl">
            <p className="text-xs opacity-60 mb-2">Instructions</p>
            <p className="text-sm">
              {currentModel === 'alphabet' 
                ? 'Hold letter for 2s to add to word → Hold Next gesture for 2s to add word to sentence'
                : 'Hold gesture for 2s to add to sentence'
              }
            </p>
          </div>
        </div>
        <video ref={videoRef} style={{display:'none'}} playsInline muted autoPlay/>
      </div>
    </div>
  )
}