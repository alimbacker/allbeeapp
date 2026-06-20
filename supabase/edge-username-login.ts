// ════════════════════════════════════════════════════════════════════════
//  ALLBEE edge function — username → email resolver (username login)
//  Deploy to:  supabase/functions/username-login/index.ts
//    supabase functions deploy username-login --no-verify-jwt
//  (--no-verify-jwt because this runs BEFORE the user is signed in.)
//
//  Supabase Auth signs in by email, not username. To support "username +
//  password" login, the client first calls this to turn a username into the
//  matching email, then calls supabase.auth.signInWithPassword({ email, ... }).
//  The username column + unique index are created by allbee-phase7-migration.sql.
//
//  Client usage (on the sign-in screen, when the input isn't an email):
//    const { data } = await supabase.functions.invoke('username-login',
//                       { body: { username } });
//    if (data?.email) await supabase.auth.signInWithPassword({ email: data.email, password });
//
//  Note: returns 404 for unknown usernames. If you'd rather not reveal whether
//  a username exists, return a generic 200 with { email: null } instead.
// ════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { username } = await req.json();
    if (!username || typeof username !== "string") return json({ error: "username is required." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin
      .from("profiles")
      .select("email")
      .ilike("username", username.trim())
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data?.email) return json({ error: "No account with that username." }, 404);
    return json({ email: data.email });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
