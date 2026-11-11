'use client'

import { useSyncExternalStore } from 'react'

/**
 * `navigator.onLine` cuma mendeteksi ada/tidaknya koneksi jaringan (mis. WiFi
 * konek), BUKAN apakah internet sungguhan bisa diakses — tapi ini cukup untuk
 * kebutuhan kita: staf toko biasanya offline karena sinyal benar-benar hilang,
 * bukan karena DNS/proxy aneh. Event 'online'/'offline' browser sudah cukup
 * akurat untuk kasus itu.
 */
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnlineStatus(): boolean {
  // Di server dianggap online, supaya hasil render awal sama dengan di browser.
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
