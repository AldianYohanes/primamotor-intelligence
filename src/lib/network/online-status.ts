'use client'

import { useEffect, useState } from 'react'

/**
 * `navigator.onLine` cuma mendeteksi ada/tidaknya koneksi jaringan (mis. WiFi
 * konek), BUKAN apakah internet sungguhan bisa diakses — tapi ini cukup untuk
 * kebutuhan kita: staf toko biasanya offline karena sinyal benar-benar hilang,
 * bukan karena DNS/proxy aneh. Event 'online'/'offline' browser sudah cukup
 * akurat untuk kasus itu.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
