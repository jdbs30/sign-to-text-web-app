'use client'

import { useRouter } from 'next/navigation'
import TopNav from '@/components/topNav'
export default function ModeSelectPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] flex items-center justify-center p-6 text-white">
      <TopNav/>
      <div className="w-full max-w-4xl space-y-10">

        {/* HEADER */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black tracking-wide">
            🤚 Sign Language App
          </h1>
          <p className="opacity-60">
            Choose how you want to use the system
          </p>
        </div>

        {/* OPTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* RECORD */}
          <button
            onClick={() => router.push('/record_commands')}
            className="group rounded-3xl p-6 bg-black/40 backdrop-blur ring-1 ring-white/10 shadow-xl hover:scale-[1.03] transition text-left"
          >
            <div className="text-5xl mb-4">🎥</div>
            <h2 className="text-2xl font-bold">Record</h2>
            <p className="opacity-60 mt-2">
              Record gestures and save the video with translated text
            </p>
          </button>

          {/* LIVE */}
          <button
            onClick={() => router.push('/live_sign')}
            className="group rounded-3xl p-6 bg-black/40 backdrop-blur ring-1 ring-white/10 shadow-xl hover:scale-[1.03] transition text-left"
          >
            <div className="text-5xl mb-4">👁</div>
            <h2 className="text-2xl font-bold">Live Feed</h2>
            <p className="opacity-60 mt-2">
              Real-time gesture detection without recording
            </p>
          </button>

          {/* HISTORY */}
          <button
            onClick={() => router.push('/history')}
            className="group rounded-3xl p-6 bg-black/40 backdrop-blur ring-1 ring-white/10 shadow-xl hover:scale-[1.03] transition text-left"
          >
            <div className="text-5xl mb-4">📜</div>
            <h2 className="text-2xl font-bold">History</h2>
            <p className="opacity-60 mt-2">
              View and replay your saved recordings
            </p>
          </button>

        </div>
      </div>
    </div>
  )
}
