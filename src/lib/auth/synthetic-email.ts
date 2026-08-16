/**
 * Supabase Auth butuh email+password. Untuk UX "username + PIN" per §3.1.1
 * desain database, kita mapping ke synthetic email: "{business_slug}.{username}@domain".
 * business_slug disertakan supaya username tetap boleh sama di toko berbeda tanpa
 * bentrok di tabel auth.users (yang unik secara global).
 */
export function toSyntheticEmail(businessSlug: string, username: string): string {
  const domain = process.env.STAFF_AUTH_EMAIL_DOMAIN ?? 'staff.internal'
  const normalizedSlug = businessSlug.trim().toLowerCase()
  const normalizedUsername = username.trim().toLowerCase()
  return `${normalizedSlug}.${normalizedUsername}@${domain}`
}

export const PIN_MIN_LENGTH = 6

export function isValidPin(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length >= PIN_MIN_LENGTH
}

export const LOCKOUT_MAX_ATTEMPTS = 5
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 menit — keputusan produk: tetap, bukan permanen
