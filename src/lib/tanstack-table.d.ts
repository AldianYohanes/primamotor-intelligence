import '@tanstack/react-table'

/**
 * TanStack Table membiarkan `meta` sepenuhnya generic/kosong secara default —
 * augmentasi ini menambahkan field `sortId` yang dipakai seluruh modul untuk
 * memetakan id kolom (accessorKey, bisa camelCase) ke nama kolom asli di
 * backend (snake_case) saat mengirim ?sortBy= ke API. Global lewat module
 * augmentation, tidak perlu diimpor manual di tiap coldef.tsx.
 */
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    sortId?: string
  }
}
