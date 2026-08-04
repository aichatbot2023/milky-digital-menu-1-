export type RoomType =
  | "living_room"
  | "kitchen"
  | "bathroom"
  | "bedroom"
  | "restaurant_table"
  | "outdoor";

export type AgeGroup = "0-6m" | "6-12m" | "1-2y" | "2-4y" | "4-7y" | "7y+";

export type HazardCategory =
  | "fall"
  | "choking"
  | "poisoning"
  | "burn"
  | "electric"
  | "cutting"
  | "drowning"
  | "crush"
  | "strangulation"
  | "other";

export type Severity = "critical" | "high" | "medium" | "low";

export interface HazardBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hazard {
  id: string;
  label: string;
  category: HazardCategory;
  severity: Severity;
  box: HazardBox;
  why: string;
  stats: string;
  fix: string;
  resolved?: boolean;
  /** COCO klasa lokalnog detektora — osnova za samoučenje (feedback). */
  sourceClass?: string;
  /** Pouzdanost lokalne detekcije 0–1 (cloud nalazi je nemaju). */
  confidence?: number;
  /**
   * Da li je NEKO ZAISTA POGLEDAO ovu sliku i potvrdio nalaz.
   *
   * Nalazi iz oblaka su potvrđeni po definiciji — nastali su gledanjem
   * fotografije. Lokalni nisu: detektor u telefonu poznaje osamdeset
   * predmeta i mora nešto da odgovori na svaki, pa mlinove za biber nazove
   * „flašom". Takav nalaz se NE prikazuje dok ga model koji vidi ne potvrdi.
   *
   * Ovo je pravilo ugrađeno u tok, ne provera koja se može zaboraviti:
   * spajanje prihvata samo ono što nosi `verified`.
   */
  verified?: boolean;
  /** Kratke činjenice „zašto je opasno" (cloud) — npr. „Temperatura ~85 °C". */
  facts?: string[];
  /** Imperativni koraci „uradi odmah" (cloud). */
  steps?: string[];
  /** Procena dohvatljivosti detetu 1–10 (cloud). */
  reach?: number;
  /**
   * ENGLESKE ključne reči proizvoda koji rešava BAŠ OVU opasnost
   * (npr. "spill proof insulated mug" za vrelu kafu) — osnova za
   * kontekstualnu preporuku i Amazon pretragu.
   */
  solution?: string;
  /** Identitet u memoriji (re-identifikacija kroz skenove). */
  memoryId?: string;
  /** Koliko je puta ista opasnost viđena u ovoj prostoriji. */
  timesSeen?: number;
  /** Kada je prvi put uočena — osnova za „nerešeno N dana". */
  firstSeenAt?: string;
  /** Prepoznata je, ali poklapanje nije bilo sigurno. */
  recognitionUncertain?: boolean;
}

export interface AnalysisResult {
  hazards: Hazard[];
  safety_score: number;
  summary: string;
}

export interface ChildProfile {
  id: string;
  name: string;
  age: AgeGroup;
}

export interface ScanRecord {
  id: string;
  createdAt: string;
  roomType: RoomType;
  childId: string | null;
  imageDataUrl: string;
  result: AnalysisResult;
}

export const ROOM_LABELS: Record<RoomType, string> = {
  living_room: "Dnevna soba",
  kitchen: "Kuhinja",
  bathroom: "Kupatilo",
  bedroom: "Spavaća soba",
  restaurant_table: "Restoranski sto",
  outdoor: "Dvorište / terasa",
};

export const AGE_LABELS: Record<AgeGroup, string> = {
  "0-6m": "0–6 meseci",
  "6-12m": "6–12 meseci (puzanje)",
  "1-2y": "1–2 godine (prohodavanje)",
  "2-4y": "2–4 godine (penjanje)",
  "4-7y": "4–7 godina",
  "7y+": "7+ godina",
};

export const CATEGORY_LABELS: Record<HazardCategory, string> = {
  fall: "Pad",
  choking: "Gušenje",
  poisoning: "Trovanje",
  burn: "Opekotina",
  electric: "Struja",
  cutting: "Posekotina",
  drowning: "Davljenje",
  crush: "Prignječenje",
  strangulation: "Davljenje trakom/kablom",
  other: "Ostalo",
};

// Boje ozbiljnosti — usklađene sa brend stilom (belo + teal): kritično i
// visoko ostaju tople upozoravajuće boje, srednje čitljiv ćilibar, nisko
// brend teal. Markeri na videu su bele pločice sa ovim bojama kao akcentom.
export const SEVERITY_META: Record<Severity, { label: string; color: string }> = {
  critical: { label: "Kritično", color: "#e11d48" },
  high: { label: "Visoko", color: "#ea580c" },
  medium: { label: "Srednje", color: "#d97706" },
  low: { label: "Nisko", color: "#0f766e" },
};
