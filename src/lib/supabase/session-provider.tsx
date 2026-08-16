"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect } from "react";
import { createClient } from "./client";
import { useUserStore } from "../stores/user-store";

export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: User | null;
  children: React.ReactNode;
}) {
  const setUser = useUserStore((state) => state.setUser);

  useEffect(() => {
    // Seed the store with what the server already fetched — no extra
    // round-trip on first paint.
    setUser(initialUser);

    // Keep it live afterwards: sign-in/sign-out/token refresh from ANY
    // page updates this store everywhere it's read, automatically.
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
    // initialUser is intentionally only used for the first seed, not a
    // reactive dependency — onAuthStateChange takes over after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return children;
}
