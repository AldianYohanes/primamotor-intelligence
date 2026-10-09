import type { StockLevelLocation, StockLevelRow } from '../data/response'

export interface ProductInput {
  id: string
  name: string
  part_number: string | null
  category: string | null
  unit: string
  min_threshold: number | null
}

export interface LocationInput {
  id: string
  name: string
  type: 'toko' | 'gudang'
}

export interface StockInput {
  product_id: string
  location_id: string
  quantity: number
  reserved_quantity: number
  available_quantity?: number
}

/**
 * Murni (tanpa I/O): pivot baris produk + lokasi + stok jadi bentuk tabel.
 * Produk tanpa baris stok di suatu lokasi dianggap 0. Total dihitung dari
 * lokasi yang dikirim (route sudah menyaring bila ada filter lokasi).
 */
export function buildStockLevelRows(
  products: ProductInput[],
  locations: LocationInput[],
  stock: StockInput[],
): StockLevelRow[] {
  const byKey = new Map<string, StockInput>()
  for (const s of stock) byKey.set(`${s.product_id}:${s.location_id}`, s)

  return products.map((p) => {
    const cells: StockLevelLocation[] = locations.map((l) => {
      const s = byKey.get(`${p.id}:${l.id}`)
      const quantity = s?.quantity ?? 0
      const reserved = s?.reserved_quantity ?? 0
      return {
        location_id: l.id,
        name: l.name,
        type: l.type,
        quantity,
        reserved_quantity: reserved,
        available_quantity: s?.available_quantity ?? quantity - reserved,
      }
    })
    const totals = cells.reduce(
      (acc, c) => ({
        quantity: acc.quantity + c.quantity,
        reserved_quantity: acc.reserved_quantity + c.reserved_quantity,
        available_quantity: acc.available_quantity + c.available_quantity,
      }),
      { quantity: 0, reserved_quantity: 0, available_quantity: 0 },
    )
    return {
      id: p.id,
      name: p.name,
      part_number: p.part_number,
      category: p.category,
      unit: p.unit,
      min_threshold: p.min_threshold,
      locations: cells,
      totals,
      is_low: p.min_threshold != null && totals.available_quantity <= p.min_threshold,
    }
  })
}
