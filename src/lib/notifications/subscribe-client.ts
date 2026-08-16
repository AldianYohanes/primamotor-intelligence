'use client'

/**
 * Sisi client dari alur push notification. Sebelumnya endpoint /api/push/subscribe
 * sudah ada tapi tidak pernah dipanggil dari mana pun — file ini yang menutup gap itu:
 * minta izin notifikasi browser, subscribe ke Push API pakai VAPID public key, lalu
 * kirim subscription ke server untuk disimpan di push_subscriptions.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export type PushSubscriptionStatus = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed'

export function getPushSupportStatus(): PushSubscriptionStatus {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission as PushSubscriptionStatus
}

/**
 * Alur lengkap: minta izin → tunggu service worker siap → subscribe → simpan ke server.
 * Aman dipanggil berkali-kali (idempoten): kalau sudah ada subscription aktif untuk
 * endpoint yang sama, server melakukan upsert (lihat app/api/push/subscribe/route.ts).
 */
export async function enablePushNotifications(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const support = getPushSupportStatus()
  if (support === 'unsupported') return { ok: false, reason: 'Perangkat/browser ini tidak mendukung push notification.' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'Izin notifikasi ditolak.' }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return { ok: false, reason: 'VAPID public key belum dikonfigurasi.' }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // TS 5.7+ mengetatkan Uint8Array jadi generik atas jenis buffer (ArrayBuffer vs
      // ArrayBufferLike/SharedArrayBuffer) — di runtime Uint8Array biasa selalu valid
      // sebagai BufferSource, jadi cast ini aman, murni menyesuaikan strictness lib.dom.
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  })

  if (!res.ok) return { ok: false, reason: 'Gagal menyimpan subscription ke server.' }
  return { ok: true }
}

export async function disablePushNotifications(): Promise<void> {
  if (getPushSupportStatus() === 'unsupported') return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  await subscription.unsubscribe()
}
