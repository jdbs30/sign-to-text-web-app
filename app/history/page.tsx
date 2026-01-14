'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import TopNav from '@/components/topNav'

interface Recording {
  id: number
  sentence: string | null
  createdAt: string
  video: {
    url: string
  } | null
}

export default function HistoryPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [focused, setFocused] = useState<Recording | null>(null)

  // Fetch history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await api.get(
          '/api/saved-signs?populate=video&sort=createdAt:desc'
        )

        const data = res.data.data.map((item: any) => ({
          id: item.id,
          sentence: item.sentence || item.attributes?.sentence || null,
          createdAt: item.createdAt || item.attributes?.createdAt,
          video: item.video || item.attributes?.video || null,
        }))

        setRecordings(data)
      } catch (err) {
        console.error('Failed to load history', err)
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [])

  // Text-to-speech when focused changes
  useEffect(() => {
    if (!focused || !focused.sentence) return

    const utterance = new SpeechSynthesisUtterance(focused.sentence)
    utterance.lang = 'en-US'
    utterance.rate = 1
    utterance.pitch = 1
    window.speechSynthesis.cancel() // Stop any previous speech
    window.speechSynthesis.speak(utterance)

    return () => {
      window.speechSynthesis.cancel() // Stop when unfocused
    }
  }, [focused])

  return (
    <>
      <TopNav />

      <div className="min-h-screen bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] p-6 text-white">
        <div className="max-w-6xl mx-auto">

          {/* HEADER */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-wide">
              📜 Gesture History
            </h1>
            <p className="opacity-60 mt-1">
              Your recorded sign language sessions
            </p>
          </div>

          {/* LOADING */}
          {loading && (
            <div className="text-center opacity-60">Loading history…</div>
          )}

          {/* EMPTY */}
          {!loading && recordings.length === 0 && (
            <div className="text-center opacity-60">No recordings yet.</div>
          )}

          {/* GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recordings.map((rec) => {
              if (!rec.video) return null

              const videoUrl = process.env.baseURL + rec.video.url
              const sentence = rec.sentence || '—'

              return (
                <div
                  key={rec.id}
                  className="flex flex-col gap-3 rounded-2xl bg-black/40 ring-1 ring-white/10 p-4 shadow-lg"
                >
                  <video
                    src={videoUrl}
                    controls
                    className="w-full rounded-xl object-cover bg-black"
                  />

                  <p className="text-center text-white/80 font-medium">{sentence}</p>

                  <button
                    onClick={() => setFocused(rec)}
                    className="self-center mt-1 text-xs px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition"
                  >
                    Focus
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* FOCUS MODAL */}
        {focused && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center px-6">
            <div className="max-w-4xl w-full rounded-3xl bg-black/60 ring-1 ring-white/10 p-6 shadow-2xl relative">
              <button
                onClick={() => setFocused(null)}
                className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl"
              >
                ✕
              </button>

              <video
                src={process.env.baseURL + focused.video!.url}
                controls
                autoPlay
                className="w-full rounded-2xl mb-6"
              />

              <div className="text-center">
                <p className="text-white/60 text-sm mb-2">Recorded Sentence</p>
                <p className="text-3xl font-black tracking-wide">
                  {focused.sentence || '—'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
