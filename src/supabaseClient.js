import { createClient } from "@supabase/supabase-js";

// Your Supabase project credentials come from the .env file (see .env.example):
//   VITE_SUPABASE_URL       = https://YOUR-PROJECT-REF.supabase.co
//   VITE_SUPABASE_ANON_KEY  = your public anon key
// Find both in the Supabase dashboard → Project Settings → API.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Don't crash the whole app (or the production build) if the keys are missing —
// surface a clear warning instead. Auth/data calls will fail until .env is set.
if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[ALLBEE] Supabase is not configured. Copy .env.example to .env and fill in " +
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server."
  );
}

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "public-anon-key-placeholder",
  { auth: { persistSession: true, autoRefreshToken: true } }
);
