export interface SelectOption {
  id: string
  name: string
}

export interface SalesTrendResponse {
  product_name: string
  trend: { period: string; total_keluar: number }[]
}
