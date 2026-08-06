/**
 * Prijem ispravki od roditelja — građa za sledeći trening modela.
 *
 * Roditelj koji dodirne 👎 na nalazu „Utičnica" zna nešto što nijedan javni
 * skup podataka nema: kako izgleda TAJ predmet u pravom stanu, na pravom
 * svetlu, sa pravog telefona. Sto takvih ispravki vredi više od hiljadu
 * slika sa interneta, jer su tačno iz sveta u kome aplikacija radi.
 *
 * Šta ovde SME da stigne, i ništa više:
 *   - isečak označenog predmeta, najviše 224 px (klijent ga takvog i pravi),
 *   - ime klase koju je model tvrdio,
 *   - da li je roditelj rekao da je tačno.
 *
 * Šta se NE prima i ne upisuje: nalog, ime, e-pošta, uređaj, mesto, vreme
 * skeniranja, cela fotografija. Zapis se namerno ne može vezati za osobu —
 * ni od nas, ni od nekoga ko bi jednog dana video bazu.
 *
 * Ovo je jedina funkcija koja prima sliku i čuva je. Zato su granice tvrde:
 * prevelik isečak, nepoznata klasa ili loš oblik zahteva se odbijaju bez
 * pogovora, a ne „popravljaju".
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

/**
 * Klase koje uopšte mogu da stignu. Spisak je zatvoren namerno: bez njega bi
 * ovo bio otvoren sanduk za slanje slika, a ne prijem ispravki.
 */
const KNOWN = new Set([
  // sopstveni model za kućne opasnosti
  'socket', 'stairs', 'candle', 'plastic_bag', 'blind', 'fireplace',
  'stove', 'heater', 'kettle', 'coin', 'bathtub', 'drawer',
  // COCO klase koje i dalje koristi postojeći detektor
  'knife', 'scissors', 'fork', 'spoon', 'bottle', 'cup', 'bowl', 'wine glass',
  'vase', 'oven', 'toaster', 'microwave', 'sink', 'refrigerator', 'toilet',
  'potted plant', 'book', 'remote', 'cell phone', 'hair drier', 'teddy bear',
  'handbag', 'backpack', 'suitcase', 'umbrella', 'chair', 'couch', 'bed',
  'dining table', 'tv', 'sports ball', 'frisbee', 'kite', 'clock',
  'toothbrush', 'mouse', 'keyboard', 'apple', 'orange', 'carrot', 'banana',
  'hot dog', 'donut', 'cake', 'pizza', 'sandwich', 'tie',
]);

/** 224 px jpeg staje daleko ispod ovoga; sve preko je nešto drugo. */
const MAX_CROP = 220_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const claim = String(body?.claim ?? '').trim();
  const crop = String(body?.crop ?? '');
  const correct = body?.correct;

  if (!KNOWN.has(claim)) return json({ error: 'unknown class' }, 400);
  if (typeof correct !== 'boolean') return json({ error: 'missing verdict' }, 400);
  if (!crop.startsWith('data:image/jpeg;base64,')) return json({ error: 'crop must be jpeg data url' }, 400);
  if (crop.length > MAX_CROP) return json({ error: 'crop too large' }, 413);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'not configured' }, 500);
  const db = createClient(url, key);

  const bytes = Uint8Array.from(atob(crop.split(',')[1]), (c) => c.charCodeAt(0));
  // Ime je nasumično i ne govori ništa: ni ko, ni kada, ni odakle.
  const name = `${claim}/${correct ? 'da' : 'ne'}/${crypto.randomUUID()}.jpg`;

  const up = await db.storage.from('sn-learning').upload(name, bytes, {
    contentType: 'image/jpeg',
    cacheControl: 'private, max-age=0',
  });
  if (up.error) {
    console.error('upload failed:', up.error.message);
    return json({ error: 'store failed' }, 500);
  }

  // Namerno bez vremena upisa preciznijeg od dana: tačan trenutak skeniranja
  // je podatak o navikama porodice, a za učenje ne znači ništa.
  const { error } = await db.from('sn_learning').insert({
    claim, correct, crop_path: name, day: new Date().toISOString().slice(0, 10),
  });
  if (error) {
    console.error('insert failed:', error.message);
    return json({ error: 'store failed' }, 500);
  }
  return json({ ok: true });
});
