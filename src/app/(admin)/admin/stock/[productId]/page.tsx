import { Suspense } from "react";
import { StockCardModule } from "@/src/modules/stock-card/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default async function StockCardPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <StockCardModule productId={productId} />
    </Suspense>
  );
}
