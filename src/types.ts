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

export const SEVERITY_META: Record<Severity, { label: string; color: string }> = {
  critical: { label: "Kritično", color: "#dc2626" },
  high: { label: "Visoko", color: "#ea580c" },
  medium: { label: "Srednje", color: "#ca8a04" },
  low: { label: "Nisko", color: "#2563eb" },
};
