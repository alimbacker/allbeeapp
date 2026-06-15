import { createClient } from "@supabase/supabase-js";

// These come from your .env file (copy .env.example to .env and fill them in).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced in the browser console so a missing .env is easy to spot.
  console.error(
    "ALLBEE: missing Supabase credentials. Copy .env.example to .env and set " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart `npm run dev`."
  );
}

export const supabase = createClient(url || "http://localhost", anonKey || "public-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});
