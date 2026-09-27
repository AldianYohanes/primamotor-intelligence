/**
 * Penentuan lokasi transaksi updateStock secara deterministik (bukan oleh LLM).
 *
 * Kalau staf tidak menyebut lokasi, atau model memakai lokasi yang tidak
 * disebut staf, transaksi tidak diteruskan ke server. Staf diminta memilih
 * lokasi, dengan saran lokasi terdekat dari posisi perangkat.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface TenantLocation {
  id: string;
  name: string;
  type: "toko" | "gudang";
  latitude: number | null;
  longitude: number | null;
}

export interface LocationChoice {
  toolName: "updateStock";
  /** Argumen dari model tanpa location_id; location_id diisi dari pilihan staf. */
  args: Record<string, unknown>;
  suggestedLocationId: string | null;
  suggestionReason: "mentioned" | "nearest" | null;
  distanceMeters: number | null;
  options: { id: string; name: string; type: "toko" | "gudang" }[];
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function nearestLocation(
  position: GeoPoint,
  locations: TenantLocation[],
): { location: TenantLocation; distanceMeters: number } | null {
  let best: { location: TenantLocation; distanceMeters: number } | null = null;
  for (const location of locations) {
    if (location.latitude === null || location.longitude === null) continue;
    const distanceMeters = haversineMeters(position, {
      latitude: location.latitude,
      longitude: location.longitude,
    });
    if (!best || distanceMeters < best.distanceMeters) best = { location, distanceMeters };
  }
  return best;
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function isSubsequence(short: string, long: string): boolean {
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
}

/**
 * Toleran singkatan & typo staf ("gdg", "gudng", "tko"): cocok eksak, beda satu
 * huruf, atau huruf-hurufnya urut di dalam kata lokasi dengan huruf awal dan
 * akhir yang sama.
 */
function tokenMatchesWord(token: string, word: string): boolean {
  if (token === word) return true;
  if (token.length >= 4 && editDistanceAtMostOne(token, word)) return true;
  return (
    token.length >= 3 &&
    token[0] === word[0] &&
    token[token.length - 1] === word[word.length - 1] &&
    isSubsequence(token, word)
  );
}

export function mentionedLocations(message: string, locations: TenantLocation[]): TenantLocation[] {
  const tokens = words(message).filter((t) => t.length >= 3);
  return locations.filter((location) => {
    const candidates = new Set([...words(location.name), location.type].filter((w) => w.length >= 3));
    return tokens.some((t) => [...candidates].some((w) => tokenMatchesWord(t, w)));
  });
}

/**
 * true = transaksi harus ditahan dan staf memilih lokasi. Lolos hanya bila
 * location_id dari model valid DAN memang lokasi yang disebut staf (atau tenant
 * cuma punya satu lokasi).
 */
export function requiresLocationChoice(
  args: Record<string, unknown>,
  userMessage: string,
  locations: TenantLocation[],
): boolean {
  if (locations.length === 0) return false;
  const chosen = locations.find((l) => l.id === args.location_id);
  if (!chosen) return true;
  if (locations.length === 1) return false;
  return !mentionedLocations(userMessage, locations).some((l) => l.id === chosen.id);
}

export function buildLocationChoice(
  args: Record<string, unknown>,
  userMessage: string,
  locations: TenantLocation[],
  devicePosition: GeoPoint | null,
): LocationChoice {
  const rest = { ...args };
  delete rest.location_id;
  const mentioned = mentionedLocations(userMessage, locations);
  const nearest = devicePosition ? nearestLocation(devicePosition, locations) : null;

  let suggestedLocationId: string | null = null;
  let suggestionReason: LocationChoice["suggestionReason"] = null;
  let distanceMeters: number | null = null;
  if (mentioned.length === 1) {
    suggestedLocationId = mentioned[0].id;
    suggestionReason = "mentioned";
  } else if (nearest) {
    suggestedLocationId = nearest.location.id;
    suggestionReason = "nearest";
    distanceMeters = Math.round(nearest.distanceMeters);
  }

  const options = locations
    .map(({ id, name, type }) => ({ id, name, type }))
    .sort((a, b) => Number(b.id === suggestedLocationId) - Number(a.id === suggestedLocationId));

  return { toolName: "updateStock", args: rest, suggestedLocationId, suggestionReason, distanceMeters, options };
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `±${meters} m` : `±${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export function locationChoiceMessage(choice: LocationChoice, productName: string | null): string {
  const quantity = choice.args.quantity ?? "";
  const direction = choice.args.direction === "keluar" ? "keluar" : "masuk";
  const what = `${direction} ${quantity} unit ${productName ?? "barang ini"}`.replace(/\s+/g, " ");
  const suggested = choice.options.find((o) => o.id === choice.suggestedLocationId);

  if (suggested && choice.suggestionReason === "nearest" && choice.distanceMeters !== null) {
    return `Lokasinya belum disebut. Mau dicatat ${what} di ${suggested.name}? Itu lokasi terdekat dari posisimu sekarang (${formatDistance(choice.distanceMeters)}). Kalau bukan, pilih lokasi lain di bawah.`;
  }
  if (suggested) {
    return `Mau dicatat ${what} di ${suggested.name}? Pilih lokasinya di bawah untuk lanjut.`;
  }
  return `Lokasinya belum disebut. Mau dicatat ${what} di mana? Pilih lokasinya di bawah.`;
}

/**
 * Posisi perangkat, atau null bila tidak diizinkan/tersedia. Batas waktu sendiri
 * karena `timeout` bawaan tidak berjalan selama prompt izin belum dijawab.
 */
export function readDevicePosition(timeoutMs = 8000): Promise<GeoPoint | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: timeoutMs },
    );
  });
}
