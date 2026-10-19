import { Suspense } from "react";
import { StockCardModule } from "@/src/modules/stock-card/Component";

export default async function StockCardPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">
          Memuat kartu stok…
        </div>
      }
    >
      <StockCardModule productId={productId} />
    </Suspense>
  );
}
