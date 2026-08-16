'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="flex w-full items-center gap-2.5 rounded-md px-0 py-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
    >
      <LogOut size={16} strokeWidth={2} />
      Keluar
    </button>
  )
}
