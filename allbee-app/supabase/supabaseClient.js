import { createClient } from "@supabase/supabase-js";

// ── ALLBEE — Supabase connection ────────────────────────────────────────────
// These two values are SAFE to keep in the code and ship to the browser:
//   • the project URL is public
//   • the publishable key has the same limited rights as the old "anon" key,
//     and your Row Level Security rules still protect every table
//
// They're used here as a fallback so the app connects even when the VITE_*
// environment variables aren't set on the host. If you DO set them in Vercel
// (Settings → Environment Variables) they take priority automatically.
//
// ⚠️  NEVER put an  sb_secret_...  or  service_role  key in this file.
//     Those have full access and must stay on a server, never in the browser.

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://ogacjpwlbhmonycjevml.supabase.co";

const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_2lhngh_yUr9nY_pIbfsRqw_ZX2IjNPu";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
