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

  return json({
    active,
    subscription: typeof s.subscription === 'string' ? s.subscription : null,
  });
});
