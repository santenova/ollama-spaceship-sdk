/**
 * Location service — resolves the user's geographic coordinates.
 *
 * Priority:
 *   1. Browser Geolocation API (most accurate)
 *   2. IP-based geolocation fallback (ipapi.co / ip-api.com)
 *   3. Defaults to (0, 0) when neither is available
 */

export interface GeoLocation {
  lat: number;
  lng: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;

interface CachedResult {
  location: GeoLocation;
  timestamp: number;
}

const CACHE_TTL_MS = 300_000; // 5 minutes
let cached: CachedResult | null = null;

async function getBrowserLocation(): Promise<GeoLocation | null> {
  if (!nav || !nav.geolocation) {
    return null;
  }
  try {
    const pos = await new Promise<{ coords: { latitude: number; longitude: number } }>((resolve, reject) => {
      nav.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 5000,
        maximumAge: CACHE_TTL_MS,
      });
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };
  } catch {
    return null;
  }
}

interface IpApiResponse {
  lat?: number;
  latitude?: number;
  lon?: number;
  lng?: number;
  longitude?: number;
}

async function getIpLocation(): Promise<GeoLocation | null> {
  for (const url of [
    'https://ipapi.co/json/',
    'http://ip-api.com/json/',
  ]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) continue;
      const data: IpApiResponse = await res.json();
      const lat = data.lat ?? data.latitude;
      const lng = data.lon ?? data.lng ?? data.longitude;
      if (typeof lat === 'number' && typeof lng === 'number') {
        return { lat, lng };
      }
    } catch {
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

export class LocationService {
  /**
   * Resolve the current location, using cached results within TTL.
   */
  static async getCurrentLocation(): Promise<GeoLocation> {
    const now = Date.now();

    // Return cached value if still fresh
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.location;
    }

    // Try browser geolocation first
    const browserLoc = await getBrowserLocation();
    if (browserLoc) {
      cached = { location: browserLoc, timestamp: now };
      return browserLoc;
    }

    // Fall back to IP geolocation
    const ipLoc = await getIpLocation();
    if (ipLoc) {
      cached = { location: ipLoc, timestamp: now };
      return ipLoc;
    }

    // Last resort: default to (0, 0)
    return { lat: 0, lng: 0 };
  }

  /** Clear the cached location — next call will re-fetch. */
  static clearCache(): void {
    cached = null;
  }
}