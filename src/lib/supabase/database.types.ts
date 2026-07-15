// Placeholder — replace by generating actual types from your project schema:
//
//   npx supabase gen types typescript --project-id <project-id> --schema public > lib/supabase/database.types.ts
//
// Once generated, client.ts and server.ts (which already import Database
// from this file) will get full type-safe table/column autocomplete with
// no other code changes needed.
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
