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
export declare class LocationService {
    /**
     * Resolve the current location, using cached results within TTL.
     */
    static getCurrentLocation(): Promise<GeoLocation>;
    /** Clear the cached location — next call will re-fetch. */
    static clearCache(): void;
}
