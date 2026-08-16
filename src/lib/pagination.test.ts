import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { parsePagination, buildPaginatedResponse } from './pagination'

function req(qs: string) {
  return new NextRequest(`http://localhost/api/x${qs}`)
}

describe('parsePagination', () => {
  it('pakai default page=1 pageSize=20 kalau query string kosong', () => {
    const result = parsePagination(req(''))
    expect(result).toEqual({ page: 1, pageSize: 20, from: 0, to: 19 })
  })

  it('menghitung from/to dengan benar untuk page > 1', () => {
    const result = parsePagination(req('?page=3&pageSize=10'))
    expect(result).toEqual({ page: 3, pageSize: 10, from: 20, to: 29 })
  })

  it('clamp pageSize ke MAX_PAGE_SIZE (100) walau diminta lebih besar', () => {
    const result = parsePagination(req('?pageSize=9999'))
    expect(result.pageSize).toBe(100)
  })

  it('clamp page ke minimum 1 kalau diminta 0 atau negatif', () => {
    expect(parsePagination(req('?page=0')).page).toBe(1)
    expect(parsePagination(req('?page=-5')).page).toBe(1)
  })

  it('fallback ke default kalau page/pageSize bukan angka valid', () => {
    const result = parsePagination(req('?page=abc&pageSize=xyz'))
    expect(result).toEqual({ page: 1, pageSize: 20, from: 0, to: 19 })
  })
})

describe('buildPaginatedResponse', () => {
  it('menghitung totalPages dengan pembulatan ke atas', () => {
    const result = buildPaginatedResponse([1, 2, 3], 45, 1, 20)
    expect(result).toEqual({ data: [1, 2, 3], page: 1, pageSize: 20, total: 45, totalPages: 3 })
  })

  it('totalPages minimal 1 walau count 0 (bukan 0 halaman)', () => {
    const result = buildPaginatedResponse([], 0, 1, 20)
    expect(result.totalPages).toBe(1)
  })

  it('fallback total ke data.length kalau count null (Supabase count gagal dihitung)', () => {
    const result = buildPaginatedResponse([1, 2], null, 1, 20)
    expect(result.total).toBe(2)
  })
})
