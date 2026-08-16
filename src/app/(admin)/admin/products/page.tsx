import { Suspense } from "react";
import { ProductsModule } from "@/src/modules/products/Component";

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">Memuat halaman produk…</div>
      }
    >
      <ProductsModule />
    </Suspense>
  );
}
