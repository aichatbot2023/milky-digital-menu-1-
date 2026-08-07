/**
 * spacematch-billing — Stripe pretplate za SpaceMatch studije.
 *
 * Tok koji radi bez ijednog ručnog koraka:
 *   1. Firma na cenovniku izabere plan → `checkout` pravi Stripe sesiju.
 *   2. Kupovina se obavi na Stripe stranici (kartica, Apple/Google Pay).
 *   3. Stripe javi webhook-om → OVDE se otvara studio, generiše se ključ i
 *      klijentu odmah stiže mejl sa linkom i ključem; nama kopija.
 *   4. Promena plana, neuspela naplata i otkazivanje stižu istim putem i
 *      menjaju status studija.
 *
 * Proizvodi i cene se prave sami pri prvom pozivu (idempotentno po
 * `lookup_key`), pa u Stripe kontrolnoj tabli nema ručnog podešavanja.
 *
 * Enterprise se NAMERNO ne prodaje ovde: to je ugovor sa uvođenjem i
 * dogovorenim obimom, ne kupovina dugmetom.
 */
import postgres from 'npm:postgres';
import Stripe from 'npm:stripe@17';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SITE = 'https://safenessai.co.uk';
const TEAM_EMAIL = 'partnership@safenessai.co.uk';
const FROM_NAME = 'SpaceMatch AI';

/** Cenovnik je jedna istina — isti brojevi kao na stranici i u granicama. */
const PLANS: Record<string, { name: string; monthly: number; yearly: number; products: number; scans: number; stores: number }> = {
  starter: { name: 'SpaceMatch Starter', monthly: 8900, yearly: 85440, products: 150, scans: 750, stores: 1 },
  professional: { name: 'SpaceMatch Professional', monthly: 34900, yearly: 335040, products: 1500, scans: 7500, stores: 3 },
  business: { name: 'SpaceMatch Business', monthly: 119000, yearly: 1142400, products: 15000, scans: 40000, stores: 10 },
};

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sql) {
    const url = Deno.env.get('SUPABASE_DB_URL');
    if (!url) throw new Error('SUPABASE_DB_URL nije dostupan');
    sql = postgres(url, { max: 3, prepare: false });
  }
  return sql;
}

function stripe(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY nije podešen');
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' as any, httpClient: Stripe.createFetchHttpClient() });
}

// ------------------------------------------------------------ pomoćne
function key(len = 28): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Isti put slanja kao u glavnoj funkciji: SMTP prvi jer nema ograničenja. */
async function notify(to: string, subject: string, html: string, replyTo?: string) {
  const user = Deno.env.get('GMAIL_OFFICE_EMAIL');
  const pass = Deno.env.get('GMAIL_OFFICE_APP_PASSWORD');
  if (user && pass) {
    try {
      const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
      const client = new SMTPClient({
        connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: user, password: pass } },
      });
      await client.send({ from: `${FROM_NAME} <${user}>`, to, subject, html, ...(replyTo ? { replyTo } : {}) });
      await client.close();
      return true;
    } catch (e) {
      console.error('smtp failed', e);
    }
  }
  const rk = Deno.env.get('RESEND_API_KEY');
  if (rk) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${rk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${FROM_NAME} <onboarding@resend.dev>`, to: [to], subject, html }),
      });
      if (r.ok) return true;
    } catch { /* pada dalje */ }
  }
  return false;
}

function frame(title: string, rows: [string, string][], footer = ''): string {
  const body = rows.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap">${escapeHtml(k)}</td>` +
    `<td style="padding:6px 0;font-size:14px;color:#111827">${v}</td></tr>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
  <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#0f766e;font-weight:700;margin:0 0 6px">SpaceMatch AI</p>
  <h2 style="margin:0 0 16px;font-size:19px;color:#0b1a17">${escapeHtml(title)}</h2>
  <table style="border-collapse:collapse">${body}</table>
  ${footer ? `<p style="margin-top:18px;font-size:13px;color:#6b7280">${footer}</p>` : ''}
  <p style="margin-top:22px;font-size:11px;color:#9ca3af">Nicholas Family LTD, London</p>
</div>`;
}

/**
 * Cena se šalje UZ sesiju umesto da se prave Price objekti u Stripe-u.
 *
 * Razlog je praktičan: naš ključ je ograničen (rk_live) i nema pravo na
 * upis proizvoda i cena. Ovako je za naplatu dovoljno jedino pravo na
 * otvaranje sesije, cenovnik ostaje na jednom mestu u kodu, i ne može da
 * se desi da se cena na sajtu i cena u Stripe-u raziđu.
 */
function lineItem(plan: string, yearly: boolean): Stripe.Checkout.SessionCreateParams.LineItem {
  const cfg = PLANS[plan];
  if (!cfg) throw new Error('unknown_plan');
  return {
    quantity: 1,
    price_data: {
      currency: 'gbp',
      unit_amount: yearly ? cfg.yearly : cfg.monthly,
      recurring: { interval: yearly ? 'year' : 'month' },
      product_data: {
        name: cfg.name,
        description: `${cfg.products.toLocaleString('en-GB')} pieces · ${cfg.scans.toLocaleString('en-GB')} scans / month · ${cfg.stores} store${cfg.stores > 1 ? 's' : ''}`,
        metadata: { spacematch_plan: plan },
      },
      metadata: { spacematch_plan: plan },
    },
  };
}

/** Otvori studio posle plaćanja ili nadogradi postojeći na novi plan. */
async function provision(opts: {
  company: string; email: string; plan: string; customer: string; subscription: string;
  vertical?: string; website?: string; slug?: string;
}) {
  const s = db();
  await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS stripe_customer text`;
  await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS stripe_subscription text`;
  await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS billing_status text`;
  await s`CREATE INDEX IF NOT EXISTS sm_tenants_sub_idx ON sm_tenants (stripe_subscription)`;

  // Već plaća? Onda je ovo promena plana, ne nov studio.
  const existing = await s`SELECT * FROM sm_tenants
    WHERE stripe_subscription = ${opts.subscription}
       OR (stripe_customer = ${opts.customer} AND NOT demo)
    ORDER BY id LIMIT 1`;
  if (existing[0]) {
    await s`UPDATE sm_tenants SET plan = ${opts.plan}, billing_status = 'active',
      stripe_subscription = ${opts.subscription}, stripe_customer = ${opts.customer},
      demo = false, active = true WHERE id = ${existing[0].id}`;
    return { tenant: existing[0], apiKey: existing[0].api_key as string, isNew: false };
  }

  // Ako je firma već imala demo napravljen od njenog sajta, taj demo
  // postaje pravi nalog — katalog koji smo im pokazali ostaje.
  const demo = opts.slug
    ? await s`SELECT * FROM sm_tenants WHERE slug = ${opts.slug} LIMIT 1`
    : await s`SELECT * FROM sm_tenants WHERE demo AND lower(contact_email) = lower(${opts.email}) ORDER BY id DESC LIMIT 1`;
  if (demo[0]) {
    await s`UPDATE sm_tenants SET plan = ${opts.plan}, billing_status = 'active', demo = false, active = true,
      stripe_customer = ${opts.customer}, stripe_subscription = ${opts.subscription},
      contact_email = COALESCE(${opts.email}, contact_email) WHERE id = ${demo[0].id}`;
    return { tenant: demo[0], apiKey: demo[0].api_key as string, isNew: false };
  }

  const base = slugify(opts.company) || `studio-${key(6)}`;
  let slug = base;
  const taken = await s`SELECT 1 AS x FROM sm_tenants WHERE slug = ${slug} LIMIT 1`;
  if (taken.length) slug = `${base}-${key(4)}`;
  const apiKey = `sm_${key(28)}`;
  const [row] = await s`INSERT INTO sm_tenants
    (slug, name, vertical, plan, api_key, contact_email, website, demo,
     stripe_customer, stripe_subscription, billing_status)
    VALUES (${slug}, ${opts.company.slice(0, 80)}, ${opts.vertical || 'furniture'}, ${opts.plan},
            ${apiKey}, ${opts.email}, ${opts.website || null}, false,
            ${opts.customer}, ${opts.subscription}, 'active')
    RETURNING *`;
  return { tenant: row, apiKey, isNew: true };
}

// ------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);

  /* ------------------------------------------------------ Stripe webhook */
  if (url.pathname.endsWith('/webhook') || req.headers.get('stripe-signature')) {
    const sig = req.headers.get('stripe-signature');
    // Svaki Stripe webhook ima SVOJ potpisni ključ. SafeNest već ima jedan;
    // ovaj endpoint dobija zaseban, pa se prvo traži njegov.
    const secret = Deno.env.get('SPACEMATCH_WEBHOOK_SECRET') ?? Deno.env.get('STRIPE_WEBHOOK_SECRET');
    const raw = await req.text();
    if (!sig || !secret) return json({ error: 'no_signature' }, 400);
    let event: Stripe.Event;
    try {
      event = await stripe().webhooks.constructEventAsync(raw, sig, secret);
    } catch (e: any) {
      console.error('bad signature', e?.message);
      return json({ error: 'bad_signature' }, 400);
    }

    try {
      const s = db();
      if (event.type === 'checkout.session.completed') {
        const ses = event.data.object as Stripe.Checkout.Session;
        const m = ses.metadata ?? {};
        const email = ses.customer_details?.email ?? String(m.email ?? '');
        const company = String(m.company ?? ses.customer_details?.name ?? email.split('@')[1] ?? 'Studio');
        const plan = String(m.plan ?? 'starter');
        const { tenant, apiKey, isNew } = await provision({
          company, email, plan,
          customer: String(ses.customer ?? ''),
          subscription: String(ses.subscription ?? ''),
          vertical: String(m.vertical ?? ''),
          website: String(m.website ?? ''),
          slug: String(m.slug ?? '') || undefined,
        });

        const link = `${SITE}/spacematch/?studio=1`;
        await notify(
          email,
          isNew ? 'Vaš SpaceMatch studio je otvoren' : 'Vaš SpaceMatch plan je promenjen',
          frame(isNew ? 'Dobrodošli u SpaceMatch' : 'Plan je promenjen', [
            ['Studio', escapeHtml(String(tenant.name ?? company))],
            ['Plan', escapeHtml(plan)],
            ['Prijava', `<a href="${link}">${link}</a>`],
            ['Ključ studija', `<code>${escapeHtml(apiKey)}</code>`],
            ['Vaš skener', `<a href="${SITE}/spacematch/?t=${escapeHtml(String(tenant.slug))}">${SITE}/spacematch/?t=${escapeHtml(String(tenant.slug))}</a>`],
          ], 'Ključ čuvajte — njime se otvara vaša kontrolna tabla. Ako vam zatreba pomoć oko uvoza kataloga, odgovorite na ovaj mejl.'),
          TEAM_EMAIL,
        );
        await notify(
          TEAM_EMAIL,
          `Nova pretplata — ${company} (${plan})`,
          frame('Nova pretplata', [
            ['Firma', escapeHtml(company)],
            ['Email', escapeHtml(email)],
            ['Plan', escapeHtml(plan)],
            ['Studio', escapeHtml(String(tenant.slug))],
            ['Stripe', escapeHtml(String(ses.subscription ?? ''))],
          ]),
        );
        // Ako je firma bila u levku, prelazi u „won"
        await s`UPDATE sm_prospects SET status = 'won', updated_at = now()
          WHERE lower(email) = lower(${email}) AND status <> 'won'`;
      }

      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const sub = event.data.object as Stripe.Subscription;
        const plan = String(sub.items.data[0]?.price?.metadata?.spacematch_plan ?? '');
        const dead = event.type === 'customer.subscription.deleted' || sub.status === 'canceled';
        await s`UPDATE sm_tenants SET
          billing_status = ${dead ? 'canceled' : sub.status},
          active = ${!dead},
          plan = COALESCE(NULLIF(${plan}, ''), plan)
          WHERE stripe_subscription = ${sub.id}`;
      }

      if (event.type === 'invoice.payment_failed') {
        const inv = event.data.object as Stripe.Invoice;
        await s`UPDATE sm_tenants SET billing_status = 'past_due'
          WHERE stripe_subscription = ${String((inv as any).subscription ?? '')}`;
        if (inv.customer_email) {
          await notify(TEAM_EMAIL, `Neuspela naplata — ${inv.customer_email}`,
            frame('Naplata nije prošla', [['Email', escapeHtml(inv.customer_email)], ['Iznos', String((inv.amount_due ?? 0) / 100)]]));
        }
      }
    } catch (e: any) {
      console.error('webhook handling failed', e?.message ?? e);
      // Stripe ponavlja na 500 — bolje ponoviti nego izgubiti pretplatu
      return json({ error: 'handler_failed' }, 500);
    }
    return json({ received: true });
  }

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = String(body?.action ?? '');

  try {
    /* --------------------------------------------------------- kupovina */
    if (action === 'checkout') {
      const plan = String(body.plan ?? '');
      if (!PLANS[plan]) return json({ error: 'unknown_plan' }, 400);
      const email = String(body.email ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'bad_email' }, 400);
      const company = String(body.company ?? '').trim().slice(0, 80);
      if (!company) return json({ error: 'company_required' }, 400);

      const s = stripe();
      const session = await s.checkout.sessions.create({
        mode: 'subscription',
        line_items: [lineItem(plan, body.yearly === true)],
        customer_email: email,
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        // Poreski broj za firme iz EU/UK — bez ovoga računi nisu upotrebljivi
        tax_id_collection: { enabled: true },
        subscription_data: {
          trial_period_days: 14,
          metadata: { company, plan, email, yearly: body.yearly === true ? '1' : '0' },
        },
        metadata: {
          company, plan, email,
          vertical: String(body.vertical ?? ''),
          website: String(body.website ?? ''),
          slug: String(body.slug ?? ''),
        },
        success_url: `${SITE}/spacematch/?paid=1&session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE}/spacematch/#pricing`,
      });

      // Zapiši nameru odmah — da se vidi i ko je odustao na Stripe stranici
      const d = db();
      await d`INSERT INTO sm_signups (company, person, email, website, vertical, plan, message, status)
        VALUES (${company}, ${String(body.person ?? '')}, ${email}, ${String(body.website ?? '')},
                ${String(body.vertical ?? '')}, ${plan}, 'checkout started', 'checkout')`;
      return json({ url: session.url });
    }

    /* ------------------------------ status posle povratka sa plaćanja */
    if (action === 'session') {
      const id = String(body.session ?? '');
      if (!id.startsWith('cs_')) return json({ error: 'bad_session' }, 400);
      let ses: Stripe.Checkout.Session | null = null;
      try {
        ses = await stripe().checkout.sessions.retrieve(id);
      } catch {
        // Ključ nema pravo čitanja — nije prepreka: studio otvara webhook,
        // a klijent u svakom slučaju dobija ključ mejlom.
        return json({ paid: true, studio: null, pending: true });
      }
      const paid = ses.payment_status === 'paid' || ses.status === 'complete';
      if (!paid) return json({ paid: false });
      const d = db();
      const rows = await d`SELECT slug, name, api_key FROM sm_tenants
        WHERE stripe_subscription = ${String(ses.subscription ?? '')} LIMIT 1`;
      return json({
        paid: true,
        email: ses.customer_details?.email ?? '',
        studio: rows[0] ? { slug: rows[0].slug, name: rows[0].name, api_key: rows[0].api_key } : null,
      });
    }

    /* ------------------------------------ upravljanje pretplatom (klijent) */
    if (action === 'portal') {
      const apiKey = String(body.api_key ?? '');
      if (apiKey.length < 12) return json({ error: 'unauthorized' }, 401);
      const d = db();
      const rows = await d`SELECT stripe_customer FROM sm_tenants WHERE api_key = ${apiKey} LIMIT 1`;
      const customer = rows[0]?.stripe_customer;
      if (!customer) return json({ error: 'no_subscription' }, 404);
      const portal = await stripe().billingPortal.sessions.create({
        customer: String(customer),
        return_url: `${SITE}/spacematch/?studio=1`,
      });
      return json({ url: portal.url });
    }

    /* ------------------------------------------------ provera podešenosti */
    if (action === 'health') {
      const admin = Deno.env.get('ADMIN_KEY');
      if (!admin || body.admin_key !== admin) return json({ error: 'unauthorized' }, 401);
      // Ograničeni ključ (rk_) nema sva prava; ovde se tačno vidi šta fali,
      // da se u Stripe-u štiklira samo ono što je potrebno.
      const s = stripe();
      const probe = async (name: string, fn: () => Promise<unknown>) => {
        try {
          await fn();
          return [name, 'ok'] as const;
        } catch (e: any) {
          const m = String(e?.message ?? e);
          // Stripe u poruci imenuje tačno pravo koje fali — to prenosimo
          const perm = /Enabling "([^"]+)"/.exec(m);
          return [name, perm ? `treba pravo: ${perm[1]}` : m.slice(0, 320)] as const;
        }
      };
      const checks = Object.fromEntries(await Promise.all([
        // Jedino OVO je neophodno da naplata radi
        probe('checkout_session_create', async () => {
          const t = await s.checkout.sessions.create({
            mode: 'subscription',
            line_items: [lineItem('starter', false)],
            customer_email: 'health-check@safenessai.co.uk',
            success_url: `${SITE}/spacematch/?paid=1`,
            cancel_url: `${SITE}/spacematch/#pricing`,
            metadata: { probe: '1' },
          });
          await s.checkout.sessions.expire(t.id).catch(() => undefined);
        }),
        // Ovo je poželjno (samouslužno upravljanje pretplatom), ali nije uslov
        probe('billing_portal', () => s.billingPortal.configurations.list({ limit: 1 })),
      ]));
      return json({
        key_type: String(Deno.env.get('STRIPE_SECRET_KEY')).slice(0, 8),
        livemode: !String(Deno.env.get('STRIPE_SECRET_KEY')).includes('_test_'),
        webhook_secret: !!(Deno.env.get('SPACEMATCH_WEBHOOK_SECRET') ?? Deno.env.get('STRIPE_WEBHOOK_SECRET')),
        webhook_secret_own: !!Deno.env.get('SPACEMATCH_WEBHOOK_SECRET'),
        webhook_url: 'https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/spacematch-billing',
        checks,
      });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e: any) {
    console.error('billing error', e?.message ?? e);
    return json({ error: e?.message ?? 'server error' }, 500);
  }
});
