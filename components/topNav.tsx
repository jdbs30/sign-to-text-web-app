'use client'

import { useRouter, usePathname } from 'next/navigation'

export default function TopNav() {
  const router = useRouter()
  const pathname = usePathname()

  const linkClass = (path: string) =>
    `px-4 py-2 rounded-lg transition text-sm font-medium
     ${
       pathname === path
         ? 'bg-white/20 text-white'
         : 'text-white/70 hover:bg-white/10'
     }`

  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex gap-2 px-3 py-2 rounded-2xl bg-black/40 backdrop-blur-xl ring-1 ring-white/10 shadow-lg">
        <button onClick={() => router.push('/mode_select')} className={linkClass('/mode_select')}>
          Home
        </button>

        <button
          onClick={() => router.push('/record_commands')}
          className={linkClass('/record_commands')}
        >
          Record
        </button>

        <button
          onClick={() => router.push('/live_sign')}
          className={linkClass('/live_sign')}
        >
          Live
        </button>

        <button
          onClick={() => router.push('/history')}
          className={linkClass('/history')}
        >
          History
        </button>

        <button
          onClick={() => {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            router.push('/login')
          }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/20 transition"
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
