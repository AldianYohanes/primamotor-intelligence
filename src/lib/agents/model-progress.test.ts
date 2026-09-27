import { describe, it, expect } from 'vitest'
import {
  estimateSecondsLeft,
  formatBytes,
  formatEta,
  phaseFromReport,
  SpeedTracker,
} from './model-progress'

const MB = 1024 ** 2

describe('phaseFromReport', () => {
  it('mengenali tahap dari teks laporan web-llm', () => {
    expect(phaseFromReport('Fetching param cache[3/40]: 120MB fetched. 7% completed, 9 secs elapsed.', 0.07)).toBe('downloading')
    expect(phaseFromReport('Loading model from cache[10/40]: 500MB loaded. 25% completed, 2 secs elapsed.', 0.25)).toBe('loading')
    expect(phaseFromReport('Loading model from cache[40/40]: 1900MB loaded. 100% completed, 8 secs elapsed.', 1)).toBe('compiling')
    expect(phaseFromReport('Start to fetch params', 0)).toBe('preparing')
  })
})

describe('SpeedTracker', () => {
  it('belum memberi kecepatan sebelum rentang minimum terpenuhi', () => {
    const s = new SpeedTracker(10_000, 3_000)
    s.add(0, 0)
    s.add(10 * MB, 2_000)
    expect(s.bytesPerSecond()).toBeNull()
  })

  it('menghitung kecepatan dari jendela terakhir', () => {
    const s = new SpeedTracker(10_000, 3_000)
    for (let t = 0; t <= 20_000; t += 1_000) s.add((t / 1_000) * 2 * MB, t)
    expect(s.bytesPerSecond()).toBeCloseTo(2 * MB, -3)
  })

  it('lonjakan shard ter-cache saat lanjut unduh keluar dari jendela', () => {
    const s = new SpeedTracker(10_000, 3_000)
    s.add(0, 0)
    s.add(900 * MB, 200) // shard lama yang sudah tersimpan dilaporkan sekaligus
    for (let t = 1_000; t <= 15_000; t += 1_000) s.add(900 * MB + (t / 1_000) * MB, t)
    expect(s.bytesPerSecond()).toBeCloseTo(MB, -3)
  })
})

describe('estimateSecondsLeft', () => {
  it('sisa byte dibagi kecepatan', () => {
    expect(estimateSecondsLeft(500 * MB, 1000 * MB, 5 * MB)).toBe(100)
  })
  it('null kalau total atau kecepatan belum diketahui', () => {
    expect(estimateSecondsLeft(0, null, 5 * MB)).toBeNull()
    expect(estimateSecondsLeft(0, 1000 * MB, null)).toBeNull()
  })
})

describe('format', () => {
  it('ukuran memakai GB di atas 1 GB', () => {
    expect(formatBytes(1.9 * 1024 ** 3)).toBe('1,9 GB')
    expect(formatBytes(250 * MB)).toBe('250 MB')
  })
  it('ETA dibulatkan kasar', () => {
    expect(formatEta(5)).toBe('sebentar lagi')
    expect(formatEta(42)).toBe('± 50 detik lagi')
    expect(formatEta(150)).toBe('± 3 menit lagi')
    expect(formatEta(4200)).toBe('± 1 jam 10 menit lagi')
  })
})
