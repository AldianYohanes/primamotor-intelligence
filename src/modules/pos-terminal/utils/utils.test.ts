import { describe, it, expect } from 'vitest'
import { getQuickCashAmounts, moveHighlight } from './utils'

describe('getQuickCashAmounts', () => {
  it('returns nothing for a zero or negative total', () => {
    expect(getQuickCashAmounts(0)).toEqual([])
    expect(getQuickCashAmounts(-5000)).toEqual([])
  })

  it('offers exact amount then the next two 50k roundings', () => {
    expect(getQuickCashAmounts(37500)).toEqual([37500, 50000, 100000])
  })

  it('skips to the next step when the total is already a multiple of 50k', () => {
    expect(getQuickCashAmounts(100000)).toEqual([100000, 150000, 200000])
  })
})

describe('moveHighlight', () => {
  it('returns -1 for an empty list', () => {
    expect(moveHighlight(-1, 1, 0)).toBe(-1)
  })

  it('starts at the first row going down and the last row going up', () => {
    expect(moveHighlight(-1, 1, 5)).toBe(0)
    expect(moveHighlight(-1, -1, 5)).toBe(4)
  })

  it('wraps around at both ends', () => {
    expect(moveHighlight(4, 1, 5)).toBe(0)
    expect(moveHighlight(0, -1, 5)).toBe(4)
  })

  it('moves one row otherwise', () => {
    expect(moveHighlight(2, 1, 5)).toBe(3)
    expect(moveHighlight(2, -1, 5)).toBe(1)
  })
})
