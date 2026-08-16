import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPin } from "@/src/lib/auth/synthetic-email";

const resetSchema = z.object({ new_pin: z.string().min(6) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: requester } = await supabase
    .from("staff")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (
    !requester ||
    (requester.role !== "owner" && requester.role !== "admin")
  ) {
    return NextResponse.json(
      { error: "Hanya owner/admin yang boleh mereset PIN" },
      { status: 403 },
    );
  }

  const parsed = resetSchema.safeParse(await req.json());
  if (!parsed.success || !isValidPin(parsed.data.new_pin)) {
    return NextResponse.json(
      { error: "PIN baru minimal 6 digit angka" },
      { status: 400 },
    );
  }

  // Target staf harus di tenant yang sama — ditegakkan lewat RLS select di bawah (server client)
  const { data: targetStaff } = await supabase
    .from("staff")
    .select("id, auth_user_id")
    .eq("id", id)
    .single();
  if (!targetStaff)
    return NextResponse.json(
      { error: "Staf tidak ditemukan" },
      { status: 404 },
    );

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(
    targetStaff.auth_user_id,
    {
      password: parsed.data.new_pin,
    },
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await admin
    .from("staff")
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
