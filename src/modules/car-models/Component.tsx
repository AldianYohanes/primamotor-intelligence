"use client";

import { useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { DataTable } from "@/src/components/ui/DataTable";
import { useGetCarModels } from "./hooks/use-get-car-models";
import { createCarModelColumns } from "./data/coldef";
import type { CarModelListParams } from "./data/response";

const PAGE_SIZE = 20;

/**
 * modules/car-models/Component.tsx — READ-ONLY. car_models itu tabel referensi
 * bersama lintas tenant tanpa business_id (§3.0/§10 project instructions),
 * tulis dibatasi RLS ke super_admin saja. Jadi modul ini sengaja tidak punya
 * form create/edit/delete sama sekali — bukan potongan fitur yang lupa
 * dikerjakan, itu memang di luar wewenang staf tenant biasa. Kalau nanti
 * dibutuhkan alur pengelolaan (tambah model baru dsb), itu perlu jalur
 * super-admin terpisah, bukan ditambahkan di sini.
 */
export function CarModelsModule() {
  const [page, setPage] = useState(1);
  const [sorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");

  const params: CarModelListParams = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, q: search || undefined }),
    [page, search],
  );
  const { carModels, pageInfo, isLoading, error } = useGetCarModels(params);
  const columns = useMemo(() => createCarModelColumns(), []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Referensi Model Mobil
        </h1>
        <p className="text-sm text-slate-500">
          Daftar model Volvo yang dipakai lintas semua toko. Hanya bisa dilihat,
          bukan diedit dari sini.
        </p>
      </div>

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Cari model…"
        className="field-input w-full max-w-xs"
      />

      {error && (
        <p className="text-sm text-red-600">
          Gagal memuat data: {error.message}
        </p>
      )}

      <DataTable
        columns={columns}
        data={carModels}
        sorting={sorting}
        onSortingChange={() => {}}
        page={pageInfo?.page ?? 1}
        totalPages={pageInfo?.totalPages ?? 1}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="Tidak ada model yang cocok dengan pencarian."
      />
    </div>
  );
}
