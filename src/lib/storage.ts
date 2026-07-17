import type { ChildProfile, ScanRecord } from "../types";

const PROFILES_KEY = "safenest.profiles";
const SCANS_KEY = "safenest.scans";
const MAX_SCANS = 20;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage pun (slike) — obriši najstarije skenove i pokušaj ponovo
    if (key === SCANS_KEY && Array.isArray(value) && value.length > 1) {
      write(key, value.slice(0, Math.floor(value.length / 2)));
    }
  }
}

export function loadProfiles(): ChildProfile[] {
  return read<ChildProfile[]>(PROFILES_KEY, []);
}

export function saveProfiles(profiles: ChildProfile[]) {
  write(PROFILES_KEY, profiles);
}

export function loadScans(): ScanRecord[] {
  return read<ScanRecord[]>(SCANS_KEY, []);
}

export function saveScan(scan: ScanRecord) {
  const scans = [scan, ...loadScans()].slice(0, MAX_SCANS);
  write(SCANS_KEY, scans);
}

export function updateScan(scan: ScanRecord) {
  const scans = loadScans().map((s) => (s.id === scan.id ? scan : s));
  write(SCANS_KEY, scans);
}

export function deleteScan(id: string) {
  write(SCANS_KEY, loadScans().filter((s) => s.id !== id));
}
