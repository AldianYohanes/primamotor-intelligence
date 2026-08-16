import type { NextRequest } from 'next/server'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

/**
 * Sebelumnya list produk/staf/opname/notifikasi mengambil SEMUA baris tanpa
 * batas — cukup ringan untuk data demo, tapi begitu satu toko riil punya
 * ratusan/ribuan produk atau riwayat opname, ini jadi query lambat dan
 * payload JSON besar dikirim ke browser tiap kali halaman dibuka.
 *
 * Pola: `?page=1&pageSize=20` di query string → dikonversi ke `.range()`
 * Supabase (0-indexed, inklusif di kedua ujung).
 */
export function parsePagination(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.nextUrl.searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { page, pageSize, from, to }
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function buildPaginatedResponse<T>(data: T[], count: number | null, page: number, pageSize: number): PaginatedResponse<T> {
  const total = count ?? data.length
  return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}
