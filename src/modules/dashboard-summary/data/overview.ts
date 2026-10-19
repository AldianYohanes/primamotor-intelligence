export interface MonthlySalesResponse {
  month: string;
  revenue: number;
  transaction_count: number;
}

export interface TopProductResponse {
  product_id: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface LowStockResponse {
  product_id: string;
  name: string;
  part_number: string | null;
  unit: string;
  available_quantity: number;
  min_threshold: number;
}

export interface DashboardOverviewResponse {
  monthly: MonthlySalesResponse[];
  top_products: TopProductResponse[];
  top_days: number;
  low_stock: LowStockResponse[];
  low_stock_total: number;
}
