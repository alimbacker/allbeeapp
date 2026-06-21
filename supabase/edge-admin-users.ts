// ════════════════════════════════════════════════════════════════════════
//  ALLBEE edge function — admin user management
//  Deploy to:  supabase/functions/admin-users/index.ts
//    supabase functions deploy admin-users
//  Requires env (set automatically by Supabase, or `supabase secrets set`):
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
//  Why this can't be client code: creating users, resetting passwords and
//  deleting users need the SERVICE ROLE key, which must never be shipped to the
//  browser. This function verifies the *caller* is a partner (superadmin) first.
//
//  Actions:
//    action: 'create',          email, password, name, role     // create a user
//    action: 'reset_password',  userId, password                // reset a password
//    action: 'set_designation', userId, designation             // set job title
//    action: 'delete',          userId                          // delete a user
//                                                                // (frees the email + username for re-use)
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
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Identify the caller from their JWT and confirm they're a partner.
    const authHeader = req.headers.get("Authorization") ?? "";
    const asCaller = createClient(url, serviceKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await asCaller.auth.getUser();
    if (uErr || !user) return json({ error: "Not signed in." }, 401);

    const admin = createClient(url, serviceKey);
    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (!me || me.role !== "superadmin") return json({ error: "Partners only." }, 403);

    // 2. Perform the requested action.
    const body = await req.json();
    const action = body?.action;

    if (action === "create") {
      const { email, password, name, role = "staff" } = body;
      if (!email || !password) return json({ error: "email and password are required." }, 400);
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      });
      if (error) return json({ error: error.message }, 400);
      // upsert the profile row (id = new auth user id)
      await admin.from("profiles").upsert({
        id: created.user.id, email, name: name ?? email.split("@")[0],
        role, active: true, approved: true,
      });
      return json({ ok: true, userId: created.user.id });
    }

    if (action === "reset_password") {
      const { userId, password } = body;
      if (!userId || !password) return json({ error: "userId and password are required." }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "set_designation") {
      const { userId, designation } = body;
      if (!userId) return json({ error: "userId is required." }, 400);
      const { error } = await admin.from("profiles").update({ designation: designation ?? null }).eq("id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete") {
      const { userId } = body;
      if (!userId) return json({ error: "userId is required." }, 400);
      if (userId === user.id) return json({ error: "You can't delete your own account." }, 400);
      // never delete a partner (superadmin)
      const { data: target } = await admin.from("profiles").select("role").eq("id", userId).single();
      if (target && target.role === "superadmin") return json({ error: "Partners can't be deleted." }, 400);
      // remove the profile first (frees the unique username), then the auth user
      // (frees the email so the account can be re-created later).
      await admin.from("profiles").delete().eq("id", userId);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
