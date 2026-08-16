import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Sengaja environment 'node' (bukan jsdom) — cakupan awal automated testing ini
 * cuma fungsi murni (mappers, utils, lib/pagination), BUKAN render komponen React.
 * Kalau nanti ditambah test komponen, environment perlu diganti jsdom + setup
 * @testing-library/react (belum ditambahkan di iterasi ini, di luar cakupan).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
