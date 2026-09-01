import useSWR from 'swr'

interface LocationOption {
  id: string
  name: string
  type: 'toko' | 'gudang'
}

async function fetchLocationOptions(): Promise<LocationOption[]> {
  const res = await fetch('/api/admin/locations?page=1&pageSize=100')
  if (!res.ok) throw new Error('Gagal memuat daftar lokasi')
  const body = await res.json()
  return (body.data ?? []).map((l: LocationOption) => ({ id: l.id, name: l.name, type: l.type }))
}

export function useGetLocationOptions() {
  const { data, error, isLoading } = useSWR('/api/admin/locations?page=1&pageSize=100', fetchLocationOptions, {
    revalidateOnFocus: false,
  })

  return {
    locationOptions: data ?? [],
    isLoading,
    error: error as Error | undefined,
  }
}
