import { describe, it, expect } from 'vitest'
import { validateAdjustment, formatDifference } from './utils'

describe('validateAdjustment', () => {
  it('accepts a valid integer >= reserved with a reason', () => {
    const r = validateAdjustment({ newQuantity: '8', reservedQuantity: 3, reason: 'Hitung ulang' })
    expect(r.ok).toBe(true)
    expect(r.value).toBe(8)
  })

  it('accepts exactly the reserved quantity', () => {
    expect(validateAdjustment({ newQuantity: '3', reservedQuantity: 3, reason: 'x' }).ok).toBe(true)
  })

  it('rejects below reserved', () => {
    const r = validateAdjustment({ newQuantity: '2', reservedQuantity: 3, reason: 'x' })
    expect(r.ok).toBe(false)
    expect(r.errors.quantity).toContain('3')
  })

  it('rejects empty, decimal and negative quantities', () => {
    for (const v of ['', ' ', '1.5', '-1', 'abc', '1e3']) {
      expect(validateAdjustment({ newQuantity: v, reservedQuantity: 0, reason: 'x' }).errors.quantity).toBeTruthy()
    }
  })

  it('requires a reason', () => {
    const r = validateAdjustment({ newQuantity: '1', reservedQuantity: 0, reason: '   ' })
    expect(r.ok).toBe(false)
    expect(r.errors.reason).toBeTruthy()
  })
})

describe('formatDifference', () => {
  it('formats sign', () => {
    expect(formatDifference(4)).toBe('+4')
    expect(formatDifference(-4)).toBe('−4')
    expect(formatDifference(0)).toBe('0')
  })
})
