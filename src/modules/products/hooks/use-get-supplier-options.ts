import useSWR from 'swr'

interface SupplierOption {
  id: string
  name: string
}

/**
 * Sengaja TIDAK impor modules/suppliers/hooks di sini — pola modul (§3) bikin
 * tiap modul berdiri sendiri, page.tsx cuma boleh impor Component.tsx satu
 * modul. Untuk kebutuhan dropdown ringan (id+name saja), fetch langsung ke
 * endpoint /api/admin/suppliers dari sini, bukan reuse internal modul lain.
 */
async function fetchSupplierOptions(): Promise<SupplierOption[]> {
  const res = await fetch('/api/admin/suppliers?page=1&pageSize=100')
  if (!res.ok) throw new Error('Gagal memuat daftar supplier')
  const body = await res.json()
  return (body.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))
}

export function useGetSupplierOptions() {
  const { data, error, isLoading } = useSWR('/api/admin/suppliers?page=1&pageSize=100', fetchSupplierOptions, {
    revalidateOnFocus: false,
  })

  return {
    supplierOptions: data ?? [],
    isLoading,
    error: error as Error | undefined,
  }
}
