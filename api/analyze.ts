// Vercel serverless function: POST /api/analyze
// Body: { image: string (base64, bez data: prefiksa), mediaType, roomType, ageGroup, childName? }
// Vraća AnalysisResult (JSON). API ključ živi samo ovde, nikad u aplikaciji.
import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const ROOM_SR: Record<string, string> = {
  living_room: "dnevna soba",
  kitchen: "kuhinja",
  bathroom: "kupatilo",
  bedroom: "spavaća soba",
  restaurant_table: "restoranski sto",
  outdoor: "dvorište ili terasa",
};

const AGE_SR: Record<string, string> = {
  "0-6m": "0–6 meseci (beba koja leži/prevrne se, sve stavlja u usta)",
  "6-12m": "6–12 meseci (puzi, pridržava se, dohvata sa niskih površina)",
  "1-2y": "1–2 godine (hoda, otvara fioke i vrata, penje se na nizak nameštaj)",
  "2-4y": "2–4 godine (trči, penje se na sto i prozorske daske, okreće kvake)",
  "4-7y": "4–7 godina (koristi makaze i uređaje, imitira odrasle)",
  "7y+": "7+ godina (samostalno, rizici: struja, hemikalije, visina, saobraćaj)",
};

const RESULT_SCHEMA = {
  type: "object" as const,
  properties: {
    hazards: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          label: { type: "string" as const },
          category: {
            type: "string" as const,
            enum: [
              "fall", "choking", "poisoning", "burn", "electric",
              "cutting", "drowning", "crush", "strangulation", "other",
            ],
          },
          severity: { type: "string" as const, enum: ["critical", "high", "medium", "low"] },
          box: {
            type: "object" as const,
            properties: {
              x: { type: "number" as const },
              y: { type: "number" as const },
              w: { type: "number" as const },
              h: { type: "number" as const },
            },
            required: ["x", "y", "w", "h"],
            additionalProperties: false,
          },
          why: { type: "string" as const },
          stats: { type: "string" as const },
          fix: { type: "string" as const },
        },
        required: ["label", "category", "severity", "box", "why", "stats", "fix"],
        additionalProperties: false,
      },
    },
    safety_score: { type: "integer" as const },
    summary: { type: "string" as const },
  },
  required: ["hazards", "safety_score", "summary"],
  additionalProperties: false,
};

function systemPrompt(roomType: string, ageGroup: string, childName?: string) {
  const room = ROOM_SR[roomType] ?? "prostor";
  const age = AGE_SR[ageGroup] ?? ageGroup;
  const child = childName ? ` po imenu ${childName}` : "";
  return `Ti si sertifikovani ekspert za bezbednost dece (childproofing) sa znanjem pedijatrijske epidemiologije povreda (SZO, CDC, EU Child Safety Alliance).

Analiziraš fotografiju prostora tipa "${room}" i identifikuješ SVE vizuelno uočljive opasnosti za dete${child} uzrasta ${age}.

Pravila:
- Prijavi SAMO ono što se zaista vidi na slici; nikad ne izmišljaj objekte.
- Ozbiljnost (severity) prilagodi razvojnim sposobnostima tog uzrasta.
- Uključi i opasne ZONE, ne samo predmete: oštre ivice u visini glave, stepenice bez zaštitne kapije, prozor ili terasa bez zaštite, ograda sa razmakom šipki većim od 10 cm, voda/bazen, mesta odakle dete može da padne.
- "box" je normalizovan bounding box (0–1) u odnosu na dimenzije slike: x,y = gornji levi ugao, w,h = širina i visina.
- "why": 2–3 rečenice zašto je opasno baš za ovaj uzrast.
- "stats": stvarna, poznata statistika za taj tip povrede sa izvorom (SZO/CDC/EU). Ako nemaš pouzdan konkretan broj, navedi opštu epidemiološku činjenicu — NIKAD izmišljene brojeve.
- "fix": konkretan korak izvodljiv odmah (ukloni van domašaja, montiraj zaštitu, zaključaj, nadzor).
- "safety_score": 0–100 (100 = potpuno bezbedno za taj uzrast).
- "summary": 2 rečenice, smiren i ohrabrujući ton — bez panike.
- Sve tekstualne vrednosti na srpskom jeziku.`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY nije podešen na serveru" });
    return;
  }

  const { image, mediaType, roomType, ageGroup, childName } = req.body ?? {};
  if (!image || !roomType || !ageGroup) {
    res.status(400).json({ error: "Nedostaju polja: image, roomType, ageGroup" });
    return;
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.SAFENEST_MODEL || "claude-opus-4-8";

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      system: systemPrompt(roomType, ageGroup, childName),
      output_config: { format: { type: "json_schema", schema: RESULT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: image,
              },
            },
            {
              type: "text",
              text: "Analiziraj ovu fotografiju i vrati mapu opasnosti u zadatom JSON formatu.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      res.status(422).json({ error: "Analiza je odbijena. Pokušajte sa drugom fotografijom." });
      return;
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      res.status(502).json({ error: "Model nije vratio rezultat" });
      return;
    }

    const parsed = JSON.parse(textBlock.text);
    res.status(200).json(parsed);
  } catch (err: any) {
    const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: err?.message || "Greška pri analizi" });
  }
}
