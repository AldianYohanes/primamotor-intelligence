import type { User } from "@supabase/supabase-js";
import { create } from "zustand";

interface UserState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
}

/**
 * Single source of truth for the current auth user on the client.
 * Seeded once from the server (see SessionProvider) and kept in sync
 * afterwards via Supabase's onAuthStateChange listener.
 *
 * This store exists purely so Client Components can read "who's logged
 * in" without prop drilling or re-fetching.
 */
export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
}));

// Convenience selectors — prevents re-renders on unrelated state changes
// and keeps call sites short: `const user = useUser()` instead of
// `const user = useUserStore((s) => s.user)` everywhere.
export const useUser = () => useUserStore((state) => state.user);
export const useIsUserLoading = () => useUserStore((state) => state.isLoading);
