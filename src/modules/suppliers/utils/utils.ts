export function formatContactLine(contactPerson: string | null, phone: string | null): string {
  const parts = [contactPerson, phone].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '-'
}
