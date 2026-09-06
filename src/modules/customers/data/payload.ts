export interface CreateCustomerPayload {
  name: string
  phone?: string
  credit_limit: number
  notes?: string
}

export interface RecordPaymentPayload {
  amount: number
  payment_method: 'cash' | 'transfer' | 'qris' | 'card'
  notes?: string
}
