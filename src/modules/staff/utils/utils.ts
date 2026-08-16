export function isCurrentlyLocked(lockedUntil: string | null): boolean {
  return !!lockedUntil && new Date(lockedUntil) > new Date()
}

export function formatDateID(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
