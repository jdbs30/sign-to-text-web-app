'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await axios.post(
        `${process.env.baseURL}/api/auth/local`,
        {
          identifier: email,
          password,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const { jwt, user } = res.data

      // Save auth data
      localStorage.setItem('token', jwt)
      localStorage.setItem('user', JSON.stringify(user))

      router.push('/live_sign') // or /dashboard
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || 'Invalid email or password'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] flex items-center justify-center p-6 text-white">
      <div className="w-full max-w-md bg-black/40 backdrop-blur-xl rounded-3xl p-8 shadow-xl ring-1 ring-white/10">

        {/* TITLE */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-wide">🤚 Sign Language App</h1>
          <p className="text-sm opacity-60 mt-2">
            Log in to continue translating gestures
          </p>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500/40 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm mb-1 opacity-70">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm mb-1 opacity-70">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 hover:scale-[1.02] transition font-bold py-3 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* FOOTER */}
        <div className="mt-6 text-center text-sm opacity-60">
          Don’t have an account?{' '}
          <a href="/register" className="underline hover:text-white">
            Sign up
          </a>
        </div>
      </div>
    </div>
  )
}
