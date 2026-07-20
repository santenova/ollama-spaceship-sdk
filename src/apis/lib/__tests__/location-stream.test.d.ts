/**
 * Jest tests for location metadata in streams and location-aware rate limiting.
 * No fetch mocking — streaming tests hit the real Ollama endpoint.
 * Location resolution uses real IP geolocation APIs (falls back to 0,0 on failure).
 */
declare const EP = "http://127.0.0.1:11434";
declare function checkEndpoint(): Promise<void>;
declare function streamToArray(stream: {
    subscribe: (obs: {
        next: (chunk: any) => void;
        error: (err: Error) => void;
        complete: (summary?: any) => void;
    }) => void;
}): Promise<any[]>;
declare let LocationService: any;
declare let RateLimiterClass: any;
