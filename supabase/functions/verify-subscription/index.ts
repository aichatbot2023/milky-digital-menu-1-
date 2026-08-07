/**
 * verify-subscription — serverska potvrda Stripe uplate.
 * Posle plaćanja, Stripe Payment Link vraća korisnika na
 * https://safenessai.co.uk/?session_id={CHECKOUT_SESSION_ID}; aplikacija
 * šalje session_id ovde, a mi kod Stripe-a proveravamo da je checkout
 * zaista završen (uklj. 7-dnevni trial: payment_status je tada
 * "no_payment_required"). Bez ove provere bilo ko bi mogao da se
 * "otključa" izmišljenim parametrom.
 *
 * Potreban secret: STRIPE_SECRET_KEY (preporuka: restricted key sa
 * dozvolom Checkout Sessions: Read).
 * Body: { session_id: "cs_..." }
 * Vraća: { active: boolean, subscription?: string }
 */

import postgres from 'npm:postgres';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return json({ error: 'Stripe ključ nije podešen na serveru.' }, 501);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const sessionId = String(body?.session_id ?? '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json({ error: 'Neispravan session_id' }, 400);

  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { 'Authorization': `Bearer ${key}` } },
  );
  if (!res.ok) {
    console.error('stripe error', res.status);
    return json({ active: false, error: `Stripe provera nije uspela (${res.status})` });
  }
  const s = await res.json();
  // "complete" = checkout završen; kod pretplate sa trial-om naplata još
  // nije izvršena pa je payment_status "no_payment_required" — i to je validno
  const active =
    s.status === 'complete' &&
    (s.payment_status === 'paid' || s.payment_status === 'no_payment_required');

  // Prodaja se pripisuje partneru (client_reference_id sa Stripe linka) —
  // server-side, ne može da se falsifikuje iz browsera
  if (active) {
    try {
      const dbUrl = Deno.env.get('SUPABASE_DB_URL');
      if (dbUrl) {
        const sqldb = postgres(dbUrl, { max: 1, prepare: false });
        await sqldb`CREATE TABLE IF NOT EXISTS sn_events (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          type text NOT NULL, ref_code text, meta jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )`;
        const ref = typeof s.client_reference_id === 'string'
          ? s.client_reference_id.slice(0, 40).replace(/[^A-Za-z0-9_-]/g, '')
          : null;
        await sqldb`INSERT INTO sn_events (type, ref_code, meta)
          VALUES ('sale', ${ref}, ${sqldb.json({ session: sessionId })})`;
        await sqldb.end();
      }
    } catch (e) {
      console.error('sale tracking failed', e);
    }
  }

  return json({
    active,
    subscription: typeof s.subscription === 'string' ? s.subscription : null,
  });
});
