import { notFound } from "next/navigation";
import { requirePage } from "@/src/lib/auth/staff-context";
import { EVAL_TENANT_SLUG } from "@/src/lib/eval/tenant";
import { EvalRunner } from "@/src/components/eval/EvalRunner";

export default async function EvalPage() {
  if (process.env.ENABLE_EVAL_PAGE !== "true") notFound();

  const ctx = await requirePage("chat.use");
  // Skenario transaksi di halaman ini mengubah stok sungguhan, jadi dibatasi
  // di server ke tenant evaluasi (sebelumnya hanya dicek di EvalRunner).
  if (ctx.tenant.slug !== EVAL_TENANT_SLUG) notFound();

  return (
    <EvalRunner
      businessId={ctx.tenant.id}
      businessSlug={ctx.ownBusiness.slug}
      staffId={ctx.staff.id}
      username={ctx.staff.username}
    />
  );
}
