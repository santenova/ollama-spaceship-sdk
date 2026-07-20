import { createEsEntities, getEsConfig, saveEsConfig, esEntities, getIndexPrefix, setIndexPrefix } from "@/apis/lib/es-entities";
import { clientLogger } from "@/apis/lib/client-logger";
export { clientLogger };
import { type RateLimiter } from "@/apis/lib/rate-limiter";
import { type AugmentedChunk, type StreamSummary } from "@/apis/lib/progress-tracker";
export declare const _local = true;
/**
 * Thinking streaming — streams thoughts and responses from the LLM using
 * vanilla fetch against Ollama's OpenAI-compatible /v1/chat/completions
 * endpoint with SSE parsing.
 *
 * The previous version of this file used the `ollama` npm SDK and
 * `process.stdout.write`, neither of which work in the browser. The
 * function below mirrors the SSE parsing pattern from the test suite and
 * uses plain `fetch` so it works in both browser and Node.
 */
interface ThinkingStreamingConfig {
    ollamaEndpoints: string[];
    model?: string | null;
    defaultModel?: string;
}
interface ThinkingStreamingResult {
    thinking: string;
    content: string;
    chunks: number;
}
/**
 * Streams thoughts and responses from the LLM. Returns the accumulated
 * thinking trace and content after the stream closes.
 */
export declare function thinkingStreamingFetch(prompt: string, config: ThinkingStreamingConfig): Promise<ThinkingStreamingResult>;
export declare function thinkingEnabled(prompt: any, config: any): Promise<{
    thinking: any;
    content: any;
}>;
export declare function dumpObject(obj: any): void;
export declare function createAxiosClient({ baseURL, headers, token, interceptResponses }: {
    baseURL: any;
    headers: any;
    token: any;
    interceptResponses?: boolean;
}): import("axios").AxiosInstance;
export declare function isLocalMode(): boolean;
export declare const serverUrl = "https://eu-vector-cloud.ngrok.dev";
export declare const headers: {
    "X-App-Id": string;
};
export declare const axiosClient: import("axios").AxiosInstance;
/**
 * Returns the Ollama endpoint.
 * - browser + local  → '/proxy'  (Vite dev proxy)
 * - Node   + local   → 'http://127.0.0.1:11434'  (direct)
 * - remote           → ngrok public URL
 */
export declare const getOllamaEndpoint: () => "/proxy" | "http://127.0.0.1:11434" | "https://christy-ramentaceous-verbatim.ngrok-free.dev";
/**
 * Returns the Elasticsearch endpoint.
 * - browser + local  → '/db'  (Vite dev proxy)
 * - Node   + local   → 'http://127.0.0.1:9200'  (direct)
 * - remote           → ngrok public URL
 */
export declare const getElasticsearchEndpoint: () => "/db" | "https://eu-vector-cloud.ngrok.dev" | "http://127.0.0.1:9200";
export declare const createOllamaClient: (apiKey?: string) => {
    apiKey: string;
};
/**
 * Standalone InvokeLLM — calls Ollama's OpenAI-compatible /v1/chat/completions endpoint.
 * Returns parsed JSON when response_json_schema is provided, otherwise plain text.
 */
export declare function invokeLLM(opts: {
    prompt?: string;
    /** OpenAI-style messages array — takes precedence over `prompt` when provided. */
    messages?: Array<{
        role: string;
        content: string;
    }>;
    /** System message (e.g. persona instructions) — prepended to the conversation. */
    system?: string | null;
    add_context_from_internet?: boolean;
    response_json_schema?: Record<string, any> | null;
    file_urls?: string | string[] | null;
    model?: string | null;
    temperature?: number;
    /** Ollama thinking extension — set true to enable chain-of-thought. */
    think?: boolean;
    /** Stream SSE chunks; incremental tokens are delivered to `onToken`. */
    stream?: boolean;
    /** Streaming callback — receives each content delta as it arrives. */
    onToken?: (delta: string) => void;
    /** OpenAI-style tool schemas — when provided, returns the raw response (for tool-call loops). */
    tools?: unknown[];
    /** Return the full raw API response instead of just the content string. */
    returnRaw?: boolean;
    /** Optional abort signal — wired to the underlying fetch for cancellation. */
    signal?: AbortSignal;
    ollamaEndpoints: string[];
    defaultModel: string;
}): Promise<any>;
export declare function createClient(config: {
    serverUrl: string;
    appId: string;
    functionsVersion?: string;
    headers: Record<string, string>;
    model: string;
    ollamaEndpoints: string[];
    messages?: any[];
    /** Rate limit settings; null/undefined = unlimited (no throttling). */
    rateLimit?: {
        maxCalls?: number;
        windowMs?: number;
    } | null;
}): {
    entities: {
        name: string;
        defaultIndex: string;
    }[];
    capabilities: {};
    setConfig: (newConfig: any) => Promise<void>;
    /**
     * Reliably update client config after creation.
     * Updates the live closure variables so all integration methods
     * (InvokeLLM, websearch, toolbox, thinking, vision, expandQuery)
     * immediately use the new values. Also persists to localStorage.
     *
     * Usage:
     *   client.updateConfig({ model: 'gpt-oss:20b' });
     *   client.updateConfig({ ollamaEndpoints: ['http://my-host:11434'] });
     */
    updateConfig: (partial: Partial<{
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    }>) => void;
    /** Returns the current live config (reflects updateConfig changes). */
    getConfig: () => {
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: typeof getEsConfig;
    saveEsConfig: typeof saveEsConfig;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: typeof getIndexPrefix;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: typeof setIndexPrefix;
    integrations: {
        Core: {
            vision: {
                /**
                 * Encode an image source into an OpenAI-compatible image_url string.
                 * Accepts:
                 *   - a dataUrl string ("data:image/...;base64,...")  → used as-is
                 *   - a raw base64 string (no prefix)                → wrapped with detected MIME
                 *   - a File / Blob object                           → read via FileReader
                 */
                encode(imageSource: string | File | Blob): Promise<string>;
                /**
                 * Send a vision request to Ollama's OpenAI-compatible /v1/chat/completions.
                 *
                 * When `schema` is provided, the response is parsed as JSON (code fences
                 * are stripped) and the parsed object is returned. Otherwise a
                 * { content, raw } object is returned.
                 *
                 * Usage (structured):
                 *   const result = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "Describe this image",
                 *     { type: "object", properties: { description: { type: "string" } } },
                 *     0,
                 *   );
                 *
                 * Usage (plain text):
                 *   const { content } = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "What is in this image?", null, 0,
                 *   );
                 */
                send(endpoint: string, model: string, imageBase64: string, prompt: string, schema?: Record<string, any> | null, temperature?: number, signal?: AbortSignal): Promise<any>;
            };
            /**
             * Expand a search query into 5-8 related terms using the LLM.
             * Returns an array always containing the original query plus expanded terms.
             * Usage:
             *   const terms = await client.integrations.Core.expandQuery("coral reefs");
             */
            expandQuery: (query: string, signal?: AbortSignal) => Promise<string[]>;
            /**
             * Run a solutions debate: prompt → keywords → 2 personas → LLM debate → solutions manifest.
             *
             * Flow:
             *   1. Converts the user prompt into focused search keywords.
             *   2. Queries two personas from Elasticsearch matching those keywords.
             *   3. Runs a multi-turn debate between the two personas (analyze → critique → refine).
             *   4. Produces a final solutions manifest with resolved approach and key arguments.
             *
             * Returns:
             *   { manifest, personas, debate }
             *
             * Usage:
             *   const { manifest, personas, debate } = await client.integrations.Core.solution(
             *     "How can we reduce plastic waste in the ocean?"
             *   );
             */
            solution: (prompt: string, signal?: AbortSignal) => Promise<{
                manifest: string;
                personas: any[];
                debate: string[];
            }>;
            thinking: (prompt: any) => Promise<ThinkingStreamingResult>;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<{
                thinking: any;
                content: any;
            }>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<void>;
            websearch: (params: any) => Promise<any>;
            toolbox: (params: any) => Promise<any>;
            InvokeLLM: (params: any) => Promise<any>;
            /**
             * Generate an embedding vector for the given text via the
             * OpenAI-compatible /v1/embeddings endpoint.
             *
             * Usage:
             *   const vec = await client.integrations.Core.vector("hello world");
             */
            vector(text: string, signal?: AbortSignal): Promise<number[] | null>;
            /**
             * Full vector pipeline: message → keywords → _all match search → reindex
             * matched docs into a dedicated vector index (created first with explicit
             * shard/replica settings) → embed single-value array fields (tags,
             * expertise_areas) as additional key embeddings via /v1/embeddings.
             *
             * Usage:
             *   const res = await client.integrations.Core.vectorIndex({ message: "..." });
             */
            vectorIndex(params: {
                message: string;
                targetIndex?: string;
                dims?: number;
                arrayFields?: string[];
                /** Field names to pull from matched docs and append to the vector-key embedding text. */
                keyNames?: string[];
                signal?: AbortSignal;
            }): Promise<{
                mode: "single";
                keywords: string[];
                sourceIndex: string;
                targetIndex: string;
                matchedCount: number;
                reindexStats: {
                    created: number;
                    updated: number;
                    srcIndex: string;
                }[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndices?: undefined;
            } | {
                mode: "multi";
                keywords: string[];
                sourceIndices: string[];
                targetIndex: string;
                matchedCount: number;
                reindexStats: any[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndex?: undefined;
            } | {
                mode: "all";
                keywords: string[];
                matchedCount: number;
                reindexStats: {
                    srcIndex: string;
                    created: number;
                    updated: number;
                }[];
                enrichedCount: number;
                targetIndex: string;
                vectorKey: number[];
                sourceIndex?: undefined;
                sourceIndices?: undefined;
            }>;
            InvokeLLMBatched: (...args: any[]) => Promise<string>;
            /**
             * Beam the same prompt to ALL available models in parallel and merge
             * results as structured JSON.
             *
             * Model selection: modelRouter.resolveAll(taskType, defaultModel) —
             * returns the full array of capability-matched models, fastest first.
             * Rate limit: always unlimited (no throttling) so all calls fire concurrently.
             *
             * Returns:
             *   {
             *     prompt: string,
             *     taskType: string,
             *     models: string[],
             *     results: Array<{
             *       model: string,
             *       status: 'fulfilled' | 'rejected',
             *       response: string | null,
             *       error: string | null,
             *       durationMs: number,
             *     }>
             *   }
             *
             * Usage:
             *   const beam = await client.integrations.Core.beaming(
             *     "What is the best way to clean an ocean?",
             *     { taskType: 'chat', signal }
             *   );
             *   beam.results.forEach(r => console.log(r.model, r.response));
             */
            beaming: (prompt: string, opts?: {
                taskType?: "chat" | "thinking" | "json" | "vision";
                signal?: AbortSignal;
                concurrency?: number;
            }) => Promise<{
                prompt: string;
                taskType: string;
                models: string[];
                results: Array<{
                    model: string;
                    status: "fulfilled" | "rejected";
                    response: string | null;
                    error: string | null;
                    durationMs: number;
                }>;
            }>;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    readonly rateLimiter: RateLimiter;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    };
    circuitBreaker: {
        readonly state: "closed" | "open" | "half-open";
        canCall(): boolean;
        onSuccess(): void;
        onFailure(): void;
        reset(): void;
    };
    abortManager: {
        create(key?: string): AbortController;
        signal(key?: string): AbortSignal | undefined;
        cancel(key?: string): void;
        cancelAll(): void;
        isActive(key: string): boolean;
    };
    clientLogger: {
        log(level: "info" | "warn" | "error" | "debug", message: string, context?: Record<string, any>, durationMs?: number): void;
        info: (msg: string, ctx?: Record<string, any>) => void;
        warn: (msg: string, ctx?: Record<string, any>) => void;
        error: (msg: string, ctx?: Record<string, any>) => void;
        timed: <T>(label: string, fn: () => Promise<T>, ctx?: Record<string, any>) => Promise<T>;
    };
    telemetry: {
        on(event: import("@/apis/lib/telemetry").TelemetryEvent, handler: (payload: Record<string, any>) => void): () => boolean;
        emit(event: import("@/apis/lib/telemetry").TelemetryEvent, payload?: Record<string, any>): void;
    };
    toolRegistry: {
        register(name: string, handler: (...args: any[]) => Promise<any>): void;
        unregister(name: string): void;
        call(name: string, ...args: any[]): Promise<any>;
        has(name: string): boolean;
        list(): string[];
        toCoreIntegrations(): Record<string, (...args: any[]) => Promise<any>>;
    };
    modelRouter: {
        readonly capabilityCache: Record<string, Record<string, number>> | null;
        invalidateCache(): void;
        resolve(taskTypeOrOpts: import("@/apis/lib/model-router").TaskType | import("@/apis/lib/model-router").ResolveOptions, _prompt?: string, defaultModel?: string, priority?: import("@/apis/lib/model-router").ModelPriority): string;
        registerTaskType(taskType: string, capabilities: string[]): void;
        readonly taskCapabilities: Record<string, string[]>;
        resolveAll(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string): string[];
        resolveAsync(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string, _priority?: import("@/apis/lib/model-router").ModelPriority): Promise<string>;
    };
    promptRouter: {
        enhance(raw: string, opts?: import("@/apis/lib/prompt-router").EnhanceOptions): Promise<string>;
    };
    authMiddleware: {
        injectAuthHeaders: (existing?: Record<string, string>) => Record<string, string>;
        withAuth: (url: string, init?: RequestInit) => Promise<Response>;
    };
    esEntities: {};
    esEndpoint: any;
    /**
     * Retrieve the full messages array of a ChatSession by its ID.
     *
     * Usage:
     *   const messages = await client.getMessages('session-id-123');
     */
    getMessages(sessionId: string): Promise<any[]>;
    /**
     * Stream a response token-by-token for any supported task.
     *
     * Supported tasks: 'chat', 'vision', 'code', 'audio'.
     * When `trackProgress` is true (default), `next` receives AugmentedChunk objects
     * with text, token count, and latency metadata. Set `trackProgress: false` for
     * plain text chunks.
     *
     * Usage:
     *   client.streamResponse('chat', 'What is the weather?').subscribe({
     *     next(chunk) { console.log(chunk.text, chunk.tokenIndex, chunk.elapsedMs); },
     *     error(err) { console.error(err); },
     *     complete() { console.log('done'); }
     *   });
     *
     *   client.streamResponse('code', 'Write a Python sort function').subscribe({…});
     *   client.streamResponse('audio', 'Explain sound waves').subscribe({…});
     */
    streamResponse(task: "chat" | "vision" | "code" | "audio" | "thinking", input: string, opts?: {
        trackProgress?: boolean;
        signal?: AbortSignal;
    }): {
        subscribe: (obs: {
            next: (chunk: string | AugmentedChunk) => void;
            error: (err: Error) => void;
            complete: (summary?: StreamSummary) => void;
        }) => void;
    };
};
export declare const config: {
    serverUrl: string;
    appId: string;
    functionsVersion: any;
    entityEndpoint: string[];
    headers: {
        'Content-Type': string;
        'X-App-Id': string;
    };
    capabilities: {};
    messages: {
        role: string;
        content: string;
    }[];
    ollamaEndpoints: string[];
    model: string;
    defaultLocation: {
        lat: number;
        lng: number;
    };
    rateLimit: {
        maxCalls?: number;
        windowMs?: number;
    } | null;
};
export declare const defaultClient: {
    entities: {
        name: string;
        defaultIndex: string;
    }[];
    capabilities: {};
    setConfig: (newConfig: any) => Promise<void>;
    /**
     * Reliably update client config after creation.
     * Updates the live closure variables so all integration methods
     * (InvokeLLM, websearch, toolbox, thinking, vision, expandQuery)
     * immediately use the new values. Also persists to localStorage.
     *
     * Usage:
     *   client.updateConfig({ model: 'gpt-oss:20b' });
     *   client.updateConfig({ ollamaEndpoints: ['http://my-host:11434'] });
     */
    updateConfig: (partial: Partial<{
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    }>) => void;
    /** Returns the current live config (reflects updateConfig changes). */
    getConfig: () => {
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: typeof getEsConfig;
    saveEsConfig: typeof saveEsConfig;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: typeof getIndexPrefix;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: typeof setIndexPrefix;
    integrations: {
        Core: {
            vision: {
                /**
                 * Encode an image source into an OpenAI-compatible image_url string.
                 * Accepts:
                 *   - a dataUrl string ("data:image/...;base64,...")  → used as-is
                 *   - a raw base64 string (no prefix)                → wrapped with detected MIME
                 *   - a File / Blob object                           → read via FileReader
                 */
                encode(imageSource: string | File | Blob): Promise<string>;
                /**
                 * Send a vision request to Ollama's OpenAI-compatible /v1/chat/completions.
                 *
                 * When `schema` is provided, the response is parsed as JSON (code fences
                 * are stripped) and the parsed object is returned. Otherwise a
                 * { content, raw } object is returned.
                 *
                 * Usage (structured):
                 *   const result = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "Describe this image",
                 *     { type: "object", properties: { description: { type: "string" } } },
                 *     0,
                 *   );
                 *
                 * Usage (plain text):
                 *   const { content } = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "What is in this image?", null, 0,
                 *   );
                 */
                send(endpoint: string, model: string, imageBase64: string, prompt: string, schema?: Record<string, any> | null, temperature?: number, signal?: AbortSignal): Promise<any>;
            };
            /**
             * Expand a search query into 5-8 related terms using the LLM.
             * Returns an array always containing the original query plus expanded terms.
             * Usage:
             *   const terms = await client.integrations.Core.expandQuery("coral reefs");
             */
            expandQuery: (query: string, signal?: AbortSignal) => Promise<string[]>;
            /**
             * Run a solutions debate: prompt → keywords → 2 personas → LLM debate → solutions manifest.
             *
             * Flow:
             *   1. Converts the user prompt into focused search keywords.
             *   2. Queries two personas from Elasticsearch matching those keywords.
             *   3. Runs a multi-turn debate between the two personas (analyze → critique → refine).
             *   4. Produces a final solutions manifest with resolved approach and key arguments.
             *
             * Returns:
             *   { manifest, personas, debate }
             *
             * Usage:
             *   const { manifest, personas, debate } = await client.integrations.Core.solution(
             *     "How can we reduce plastic waste in the ocean?"
             *   );
             */
            solution: (prompt: string, signal?: AbortSignal) => Promise<{
                manifest: string;
                personas: any[];
                debate: string[];
            }>;
            thinking: (prompt: any) => Promise<ThinkingStreamingResult>;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<{
                thinking: any;
                content: any;
            }>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<void>;
            websearch: (params: any) => Promise<any>;
            toolbox: (params: any) => Promise<any>;
            InvokeLLM: (params: any) => Promise<any>;
            /**
             * Generate an embedding vector for the given text via the
             * OpenAI-compatible /v1/embeddings endpoint.
             *
             * Usage:
             *   const vec = await client.integrations.Core.vector("hello world");
             */
            vector(text: string, signal?: AbortSignal): Promise<number[] | null>;
            /**
             * Full vector pipeline: message → keywords → _all match search → reindex
             * matched docs into a dedicated vector index (created first with explicit
             * shard/replica settings) → embed single-value array fields (tags,
             * expertise_areas) as additional key embeddings via /v1/embeddings.
             *
             * Usage:
             *   const res = await client.integrations.Core.vectorIndex({ message: "..." });
             */
            vectorIndex(params: {
                message: string;
                targetIndex?: string;
                dims?: number;
                arrayFields?: string[];
                /** Field names to pull from matched docs and append to the vector-key embedding text. */
                keyNames?: string[];
                signal?: AbortSignal;
            }): Promise<{
                mode: "single";
                keywords: string[];
                sourceIndex: string;
                targetIndex: string;
                matchedCount: number;
                reindexStats: {
                    created: number;
                    updated: number;
                    srcIndex: string;
                }[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndices?: undefined;
            } | {
                mode: "multi";
                keywords: string[];
                sourceIndices: string[];
                targetIndex: string;
                matchedCount: number;
                reindexStats: any[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndex?: undefined;
            } | {
                mode: "all";
                keywords: string[];
                matchedCount: number;
                reindexStats: {
                    srcIndex: string;
                    created: number;
                    updated: number;
                }[];
                enrichedCount: number;
                targetIndex: string;
                vectorKey: number[];
                sourceIndex?: undefined;
                sourceIndices?: undefined;
            }>;
            InvokeLLMBatched: (...args: any[]) => Promise<string>;
            /**
             * Beam the same prompt to ALL available models in parallel and merge
             * results as structured JSON.
             *
             * Model selection: modelRouter.resolveAll(taskType, defaultModel) —
             * returns the full array of capability-matched models, fastest first.
             * Rate limit: always unlimited (no throttling) so all calls fire concurrently.
             *
             * Returns:
             *   {
             *     prompt: string,
             *     taskType: string,
             *     models: string[],
             *     results: Array<{
             *       model: string,
             *       status: 'fulfilled' | 'rejected',
             *       response: string | null,
             *       error: string | null,
             *       durationMs: number,
             *     }>
             *   }
             *
             * Usage:
             *   const beam = await client.integrations.Core.beaming(
             *     "What is the best way to clean an ocean?",
             *     { taskType: 'chat', signal }
             *   );
             *   beam.results.forEach(r => console.log(r.model, r.response));
             */
            beaming: (prompt: string, opts?: {
                taskType?: "chat" | "thinking" | "json" | "vision";
                signal?: AbortSignal;
                concurrency?: number;
            }) => Promise<{
                prompt: string;
                taskType: string;
                models: string[];
                results: Array<{
                    model: string;
                    status: "fulfilled" | "rejected";
                    response: string | null;
                    error: string | null;
                    durationMs: number;
                }>;
            }>;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    readonly rateLimiter: RateLimiter;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    };
    circuitBreaker: {
        readonly state: "closed" | "open" | "half-open";
        canCall(): boolean;
        onSuccess(): void;
        onFailure(): void;
        reset(): void;
    };
    abortManager: {
        create(key?: string): AbortController;
        signal(key?: string): AbortSignal | undefined;
        cancel(key?: string): void;
        cancelAll(): void;
        isActive(key: string): boolean;
    };
    clientLogger: {
        log(level: "info" | "warn" | "error" | "debug", message: string, context?: Record<string, any>, durationMs?: number): void;
        info: (msg: string, ctx?: Record<string, any>) => void;
        warn: (msg: string, ctx?: Record<string, any>) => void;
        error: (msg: string, ctx?: Record<string, any>) => void;
        timed: <T>(label: string, fn: () => Promise<T>, ctx?: Record<string, any>) => Promise<T>;
    };
    telemetry: {
        on(event: import("@/apis/lib/telemetry").TelemetryEvent, handler: (payload: Record<string, any>) => void): () => boolean;
        emit(event: import("@/apis/lib/telemetry").TelemetryEvent, payload?: Record<string, any>): void;
    };
    toolRegistry: {
        register(name: string, handler: (...args: any[]) => Promise<any>): void;
        unregister(name: string): void;
        call(name: string, ...args: any[]): Promise<any>;
        has(name: string): boolean;
        list(): string[];
        toCoreIntegrations(): Record<string, (...args: any[]) => Promise<any>>;
    };
    modelRouter: {
        readonly capabilityCache: Record<string, Record<string, number>> | null;
        invalidateCache(): void;
        resolve(taskTypeOrOpts: import("@/apis/lib/model-router").TaskType | import("@/apis/lib/model-router").ResolveOptions, _prompt?: string, defaultModel?: string, priority?: import("@/apis/lib/model-router").ModelPriority): string;
        registerTaskType(taskType: string, capabilities: string[]): void;
        readonly taskCapabilities: Record<string, string[]>;
        resolveAll(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string): string[];
        resolveAsync(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string, _priority?: import("@/apis/lib/model-router").ModelPriority): Promise<string>;
    };
    promptRouter: {
        enhance(raw: string, opts?: import("@/apis/lib/prompt-router").EnhanceOptions): Promise<string>;
    };
    authMiddleware: {
        injectAuthHeaders: (existing?: Record<string, string>) => Record<string, string>;
        withAuth: (url: string, init?: RequestInit) => Promise<Response>;
    };
    esEntities: {};
    esEndpoint: any;
    /**
     * Retrieve the full messages array of a ChatSession by its ID.
     *
     * Usage:
     *   const messages = await client.getMessages('session-id-123');
     */
    getMessages(sessionId: string): Promise<any[]>;
    /**
     * Stream a response token-by-token for any supported task.
     *
     * Supported tasks: 'chat', 'vision', 'code', 'audio'.
     * When `trackProgress` is true (default), `next` receives AugmentedChunk objects
     * with text, token count, and latency metadata. Set `trackProgress: false` for
     * plain text chunks.
     *
     * Usage:
     *   client.streamResponse('chat', 'What is the weather?').subscribe({
     *     next(chunk) { console.log(chunk.text, chunk.tokenIndex, chunk.elapsedMs); },
     *     error(err) { console.error(err); },
     *     complete() { console.log('done'); }
     *   });
     *
     *   client.streamResponse('code', 'Write a Python sort function').subscribe({…});
     *   client.streamResponse('audio', 'Explain sound waves').subscribe({…});
     */
    streamResponse(task: "chat" | "vision" | "code" | "audio" | "thinking", input: string, opts?: {
        trackProgress?: boolean;
        signal?: AbortSignal;
    }): {
        subscribe: (obs: {
            next: (chunk: string | AugmentedChunk) => void;
            error: (err: Error) => void;
            complete: (summary?: StreamSummary) => void;
        }) => void;
    };
};
export declare const createclientWithFallback: (_originalclient?: any) => {
    entities: {};
    capabilities: {};
    setConfig: (newConfig: any) => Promise<void>;
    /**
     * Reliably update client config after creation.
     * Updates the live closure variables so all integration methods
     * (InvokeLLM, websearch, toolbox, thinking, vision, expandQuery)
     * immediately use the new values. Also persists to localStorage.
     *
     * Usage:
     *   client.updateConfig({ model: 'gpt-oss:20b' });
     *   client.updateConfig({ ollamaEndpoints: ['http://my-host:11434'] });
     */
    updateConfig: (partial: Partial<{
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    }>) => void;
    /** Returns the current live config (reflects updateConfig changes). */
    getConfig: () => {
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: typeof getEsConfig;
    saveEsConfig: typeof saveEsConfig;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: typeof getIndexPrefix;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: typeof setIndexPrefix;
    integrations: {
        Core: {
            vision: {
                /**
                 * Encode an image source into an OpenAI-compatible image_url string.
                 * Accepts:
                 *   - a dataUrl string ("data:image/...;base64,...")  → used as-is
                 *   - a raw base64 string (no prefix)                → wrapped with detected MIME
                 *   - a File / Blob object                           → read via FileReader
                 */
                encode(imageSource: string | File | Blob): Promise<string>;
                /**
                 * Send a vision request to Ollama's OpenAI-compatible /v1/chat/completions.
                 *
                 * When `schema` is provided, the response is parsed as JSON (code fences
                 * are stripped) and the parsed object is returned. Otherwise a
                 * { content, raw } object is returned.
                 *
                 * Usage (structured):
                 *   const result = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "Describe this image",
                 *     { type: "object", properties: { description: { type: "string" } } },
                 *     0,
                 *   );
                 *
                 * Usage (plain text):
                 *   const { content } = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "What is in this image?", null, 0,
                 *   );
                 */
                send(endpoint: string, model: string, imageBase64: string, prompt: string, schema?: Record<string, any> | null, temperature?: number, signal?: AbortSignal): Promise<any>;
            };
            /**
             * Expand a search query into 5-8 related terms using the LLM.
             * Returns an array always containing the original query plus expanded terms.
             * Usage:
             *   const terms = await client.integrations.Core.expandQuery("coral reefs");
             */
            expandQuery: (query: string, signal?: AbortSignal) => Promise<string[]>;
            /**
             * Run a solutions debate: prompt → keywords → 2 personas → LLM debate → solutions manifest.
             *
             * Flow:
             *   1. Converts the user prompt into focused search keywords.
             *   2. Queries two personas from Elasticsearch matching those keywords.
             *   3. Runs a multi-turn debate between the two personas (analyze → critique → refine).
             *   4. Produces a final solutions manifest with resolved approach and key arguments.
             *
             * Returns:
             *   { manifest, personas, debate }
             *
             * Usage:
             *   const { manifest, personas, debate } = await client.integrations.Core.solution(
             *     "How can we reduce plastic waste in the ocean?"
             *   );
             */
            solution: (prompt: string, signal?: AbortSignal) => Promise<{
                manifest: string;
                personas: any[];
                debate: string[];
            }>;
            thinking: (prompt: any) => Promise<ThinkingStreamingResult>;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<{
                thinking: any;
                content: any;
            }>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<void>;
            websearch: (params: any) => Promise<any>;
            toolbox: (params: any) => Promise<any>;
            InvokeLLM: (params: any) => Promise<any>;
            /**
             * Generate an embedding vector for the given text via the
             * OpenAI-compatible /v1/embeddings endpoint.
             *
             * Usage:
             *   const vec = await client.integrations.Core.vector("hello world");
             */
            vector(text: string, signal?: AbortSignal): Promise<number[] | null>;
            /**
             * Full vector pipeline: message → keywords → _all match search → reindex
             * matched docs into a dedicated vector index (created first with explicit
             * shard/replica settings) → embed single-value array fields (tags,
             * expertise_areas) as additional key embeddings via /v1/embeddings.
             *
             * Usage:
             *   const res = await client.integrations.Core.vectorIndex({ message: "..." });
             */
            vectorIndex(params: {
                message: string;
                targetIndex?: string;
                dims?: number;
                arrayFields?: string[];
                /** Field names to pull from matched docs and append to the vector-key embedding text. */
                keyNames?: string[];
                signal?: AbortSignal;
            }): Promise<{
                mode: "single";
                keywords: string[];
                sourceIndex: string;
                targetIndex: string;
                matchedCount: number;
                reindexStats: {
                    created: number;
                    updated: number;
                    srcIndex: string;
                }[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndices?: undefined;
            } | {
                mode: "multi";
                keywords: string[];
                sourceIndices: string[];
                targetIndex: string;
                matchedCount: number;
                reindexStats: any[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndex?: undefined;
            } | {
                mode: "all";
                keywords: string[];
                matchedCount: number;
                reindexStats: {
                    srcIndex: string;
                    created: number;
                    updated: number;
                }[];
                enrichedCount: number;
                targetIndex: string;
                vectorKey: number[];
                sourceIndex?: undefined;
                sourceIndices?: undefined;
            }>;
            InvokeLLMBatched: (...args: any[]) => Promise<string>;
            /**
             * Beam the same prompt to ALL available models in parallel and merge
             * results as structured JSON.
             *
             * Model selection: modelRouter.resolveAll(taskType, defaultModel) —
             * returns the full array of capability-matched models, fastest first.
             * Rate limit: always unlimited (no throttling) so all calls fire concurrently.
             *
             * Returns:
             *   {
             *     prompt: string,
             *     taskType: string,
             *     models: string[],
             *     results: Array<{
             *       model: string,
             *       status: 'fulfilled' | 'rejected',
             *       response: string | null,
             *       error: string | null,
             *       durationMs: number,
             *     }>
             *   }
             *
             * Usage:
             *   const beam = await client.integrations.Core.beaming(
             *     "What is the best way to clean an ocean?",
             *     { taskType: 'chat', signal }
             *   );
             *   beam.results.forEach(r => console.log(r.model, r.response));
             */
            beaming: (prompt: string, opts?: {
                taskType?: "chat" | "thinking" | "json" | "vision";
                signal?: AbortSignal;
                concurrency?: number;
            }) => Promise<{
                prompt: string;
                taskType: string;
                models: string[];
                results: Array<{
                    model: string;
                    status: "fulfilled" | "rejected";
                    response: string | null;
                    error: string | null;
                    durationMs: number;
                }>;
            }>;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    rateLimiter: RateLimiter;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    };
    circuitBreaker: {
        readonly state: "closed" | "open" | "half-open";
        canCall(): boolean;
        onSuccess(): void;
        onFailure(): void;
        reset(): void;
    };
    abortManager: {
        create(key?: string): AbortController;
        signal(key?: string): AbortSignal | undefined;
        cancel(key?: string): void;
        cancelAll(): void;
        isActive(key: string): boolean;
    };
    clientLogger: {
        log(level: "info" | "warn" | "error" | "debug", message: string, context?: Record<string, any>, durationMs?: number): void;
        info: (msg: string, ctx?: Record<string, any>) => void;
        warn: (msg: string, ctx?: Record<string, any>) => void;
        error: (msg: string, ctx?: Record<string, any>) => void;
        timed: <T>(label: string, fn: () => Promise<T>, ctx?: Record<string, any>) => Promise<T>;
    };
    telemetry: {
        on(event: import("@/apis/lib/telemetry").TelemetryEvent, handler: (payload: Record<string, any>) => void): () => boolean;
        emit(event: import("@/apis/lib/telemetry").TelemetryEvent, payload?: Record<string, any>): void;
    };
    toolRegistry: {
        register(name: string, handler: (...args: any[]) => Promise<any>): void;
        unregister(name: string): void;
        call(name: string, ...args: any[]): Promise<any>;
        has(name: string): boolean;
        list(): string[];
        toCoreIntegrations(): Record<string, (...args: any[]) => Promise<any>>;
    };
    modelRouter: {
        readonly capabilityCache: Record<string, Record<string, number>> | null;
        invalidateCache(): void;
        resolve(taskTypeOrOpts: import("@/apis/lib/model-router").TaskType | import("@/apis/lib/model-router").ResolveOptions, _prompt?: string, defaultModel?: string, priority?: import("@/apis/lib/model-router").ModelPriority): string;
        registerTaskType(taskType: string, capabilities: string[]): void;
        readonly taskCapabilities: Record<string, string[]>;
        resolveAll(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string): string[];
        resolveAsync(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string, _priority?: import("@/apis/lib/model-router").ModelPriority): Promise<string>;
    };
    promptRouter: {
        enhance(raw: string, opts?: import("@/apis/lib/prompt-router").EnhanceOptions): Promise<string>;
    };
    authMiddleware: {
        injectAuthHeaders: (existing?: Record<string, string>) => Record<string, string>;
        withAuth: (url: string, init?: RequestInit) => Promise<Response>;
    };
    esEntities: {};
    esEndpoint: any;
    /**
     * Retrieve the full messages array of a ChatSession by its ID.
     *
     * Usage:
     *   const messages = await client.getMessages('session-id-123');
     */
    getMessages(sessionId: string): Promise<any[]>;
    /**
     * Stream a response token-by-token for any supported task.
     *
     * Supported tasks: 'chat', 'vision', 'code', 'audio'.
     * When `trackProgress` is true (default), `next` receives AugmentedChunk objects
     * with text, token count, and latency metadata. Set `trackProgress: false` for
     * plain text chunks.
     *
     * Usage:
     *   client.streamResponse('chat', 'What is the weather?').subscribe({
     *     next(chunk) { console.log(chunk.text, chunk.tokenIndex, chunk.elapsedMs); },
     *     error(err) { console.error(err); },
     *     complete() { console.log('done'); }
     *   });
     *
     *   client.streamResponse('code', 'Write a Python sort function').subscribe({…});
     *   client.streamResponse('audio', 'Explain sound waves').subscribe({…});
     */
    streamResponse(task: "chat" | "vision" | "code" | "audio" | "thinking", input: string, opts?: {
        trackProgress?: boolean;
        signal?: AbortSignal;
    }): {
        subscribe: (obs: {
            next: (chunk: string | AugmentedChunk) => void;
            error: (err: Error) => void;
            complete: (summary?: StreamSummary) => void;
        }) => void;
    };
};
export declare const esConfig: {
    endpoint: any;
    enabled: any;
    indexPrefix: any;
    indices: any;
    _v: number;
};
export declare const baseClient: {
    entities: {};
    capabilities: {};
    setConfig: (newConfig: any) => Promise<void>;
    /**
     * Reliably update client config after creation.
     * Updates the live closure variables so all integration methods
     * (InvokeLLM, websearch, toolbox, thinking, vision, expandQuery)
     * immediately use the new values. Also persists to localStorage.
     *
     * Usage:
     *   client.updateConfig({ model: 'gpt-oss:20b' });
     *   client.updateConfig({ ollamaEndpoints: ['http://my-host:11434'] });
     */
    updateConfig: (partial: Partial<{
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    }>) => void;
    /** Returns the current live config (reflects updateConfig changes). */
    getConfig: () => {
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: typeof getEsConfig;
    saveEsConfig: typeof saveEsConfig;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: typeof getIndexPrefix;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: typeof setIndexPrefix;
    integrations: {
        Core: {
            vision: {
                /**
                 * Encode an image source into an OpenAI-compatible image_url string.
                 * Accepts:
                 *   - a dataUrl string ("data:image/...;base64,...")  → used as-is
                 *   - a raw base64 string (no prefix)                → wrapped with detected MIME
                 *   - a File / Blob object                           → read via FileReader
                 */
                encode(imageSource: string | File | Blob): Promise<string>;
                /**
                 * Send a vision request to Ollama's OpenAI-compatible /v1/chat/completions.
                 *
                 * When `schema` is provided, the response is parsed as JSON (code fences
                 * are stripped) and the parsed object is returned. Otherwise a
                 * { content, raw } object is returned.
                 *
                 * Usage (structured):
                 *   const result = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "Describe this image",
                 *     { type: "object", properties: { description: { type: "string" } } },
                 *     0,
                 *   );
                 *
                 * Usage (plain text):
                 *   const { content } = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "What is in this image?", null, 0,
                 *   );
                 */
                send(endpoint: string, model: string, imageBase64: string, prompt: string, schema?: Record<string, any> | null, temperature?: number, signal?: AbortSignal): Promise<any>;
            };
            /**
             * Expand a search query into 5-8 related terms using the LLM.
             * Returns an array always containing the original query plus expanded terms.
             * Usage:
             *   const terms = await client.integrations.Core.expandQuery("coral reefs");
             */
            expandQuery: (query: string, signal?: AbortSignal) => Promise<string[]>;
            /**
             * Run a solutions debate: prompt → keywords → 2 personas → LLM debate → solutions manifest.
             *
             * Flow:
             *   1. Converts the user prompt into focused search keywords.
             *   2. Queries two personas from Elasticsearch matching those keywords.
             *   3. Runs a multi-turn debate between the two personas (analyze → critique → refine).
             *   4. Produces a final solutions manifest with resolved approach and key arguments.
             *
             * Returns:
             *   { manifest, personas, debate }
             *
             * Usage:
             *   const { manifest, personas, debate } = await client.integrations.Core.solution(
             *     "How can we reduce plastic waste in the ocean?"
             *   );
             */
            solution: (prompt: string, signal?: AbortSignal) => Promise<{
                manifest: string;
                personas: any[];
                debate: string[];
            }>;
            thinking: (prompt: any) => Promise<ThinkingStreamingResult>;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<{
                thinking: any;
                content: any;
            }>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<void>;
            websearch: (params: any) => Promise<any>;
            toolbox: (params: any) => Promise<any>;
            InvokeLLM: (params: any) => Promise<any>;
            /**
             * Generate an embedding vector for the given text via the
             * OpenAI-compatible /v1/embeddings endpoint.
             *
             * Usage:
             *   const vec = await client.integrations.Core.vector("hello world");
             */
            vector(text: string, signal?: AbortSignal): Promise<number[] | null>;
            /**
             * Full vector pipeline: message → keywords → _all match search → reindex
             * matched docs into a dedicated vector index (created first with explicit
             * shard/replica settings) → embed single-value array fields (tags,
             * expertise_areas) as additional key embeddings via /v1/embeddings.
             *
             * Usage:
             *   const res = await client.integrations.Core.vectorIndex({ message: "..." });
             */
            vectorIndex(params: {
                message: string;
                targetIndex?: string;
                dims?: number;
                arrayFields?: string[];
                /** Field names to pull from matched docs and append to the vector-key embedding text. */
                keyNames?: string[];
                signal?: AbortSignal;
            }): Promise<{
                mode: "single";
                keywords: string[];
                sourceIndex: string;
                targetIndex: string;
                matchedCount: number;
                reindexStats: {
                    created: number;
                    updated: number;
                    srcIndex: string;
                }[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndices?: undefined;
            } | {
                mode: "multi";
                keywords: string[];
                sourceIndices: string[];
                targetIndex: string;
                matchedCount: number;
                reindexStats: any[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndex?: undefined;
            } | {
                mode: "all";
                keywords: string[];
                matchedCount: number;
                reindexStats: {
                    srcIndex: string;
                    created: number;
                    updated: number;
                }[];
                enrichedCount: number;
                targetIndex: string;
                vectorKey: number[];
                sourceIndex?: undefined;
                sourceIndices?: undefined;
            }>;
            InvokeLLMBatched: (...args: any[]) => Promise<string>;
            /**
             * Beam the same prompt to ALL available models in parallel and merge
             * results as structured JSON.
             *
             * Model selection: modelRouter.resolveAll(taskType, defaultModel) —
             * returns the full array of capability-matched models, fastest first.
             * Rate limit: always unlimited (no throttling) so all calls fire concurrently.
             *
             * Returns:
             *   {
             *     prompt: string,
             *     taskType: string,
             *     models: string[],
             *     results: Array<{
             *       model: string,
             *       status: 'fulfilled' | 'rejected',
             *       response: string | null,
             *       error: string | null,
             *       durationMs: number,
             *     }>
             *   }
             *
             * Usage:
             *   const beam = await client.integrations.Core.beaming(
             *     "What is the best way to clean an ocean?",
             *     { taskType: 'chat', signal }
             *   );
             *   beam.results.forEach(r => console.log(r.model, r.response));
             */
            beaming: (prompt: string, opts?: {
                taskType?: "chat" | "thinking" | "json" | "vision";
                signal?: AbortSignal;
                concurrency?: number;
            }) => Promise<{
                prompt: string;
                taskType: string;
                models: string[];
                results: Array<{
                    model: string;
                    status: "fulfilled" | "rejected";
                    response: string | null;
                    error: string | null;
                    durationMs: number;
                }>;
            }>;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    rateLimiter: RateLimiter;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    };
    circuitBreaker: {
        readonly state: "closed" | "open" | "half-open";
        canCall(): boolean;
        onSuccess(): void;
        onFailure(): void;
        reset(): void;
    };
    abortManager: {
        create(key?: string): AbortController;
        signal(key?: string): AbortSignal | undefined;
        cancel(key?: string): void;
        cancelAll(): void;
        isActive(key: string): boolean;
    };
    clientLogger: {
        log(level: "info" | "warn" | "error" | "debug", message: string, context?: Record<string, any>, durationMs?: number): void;
        info: (msg: string, ctx?: Record<string, any>) => void;
        warn: (msg: string, ctx?: Record<string, any>) => void;
        error: (msg: string, ctx?: Record<string, any>) => void;
        timed: <T>(label: string, fn: () => Promise<T>, ctx?: Record<string, any>) => Promise<T>;
    };
    telemetry: {
        on(event: import("@/apis/lib/telemetry").TelemetryEvent, handler: (payload: Record<string, any>) => void): () => boolean;
        emit(event: import("@/apis/lib/telemetry").TelemetryEvent, payload?: Record<string, any>): void;
    };
    toolRegistry: {
        register(name: string, handler: (...args: any[]) => Promise<any>): void;
        unregister(name: string): void;
        call(name: string, ...args: any[]): Promise<any>;
        has(name: string): boolean;
        list(): string[];
        toCoreIntegrations(): Record<string, (...args: any[]) => Promise<any>>;
    };
    modelRouter: {
        readonly capabilityCache: Record<string, Record<string, number>> | null;
        invalidateCache(): void;
        resolve(taskTypeOrOpts: import("@/apis/lib/model-router").TaskType | import("@/apis/lib/model-router").ResolveOptions, _prompt?: string, defaultModel?: string, priority?: import("@/apis/lib/model-router").ModelPriority): string;
        registerTaskType(taskType: string, capabilities: string[]): void;
        readonly taskCapabilities: Record<string, string[]>;
        resolveAll(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string): string[];
        resolveAsync(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string, _priority?: import("@/apis/lib/model-router").ModelPriority): Promise<string>;
    };
    promptRouter: {
        enhance(raw: string, opts?: import("@/apis/lib/prompt-router").EnhanceOptions): Promise<string>;
    };
    authMiddleware: {
        injectAuthHeaders: (existing?: Record<string, string>) => Record<string, string>;
        withAuth: (url: string, init?: RequestInit) => Promise<Response>;
    };
    esEntities: {};
    esEndpoint: any;
    /**
     * Retrieve the full messages array of a ChatSession by its ID.
     *
     * Usage:
     *   const messages = await client.getMessages('session-id-123');
     */
    getMessages(sessionId: string): Promise<any[]>;
    /**
     * Stream a response token-by-token for any supported task.
     *
     * Supported tasks: 'chat', 'vision', 'code', 'audio'.
     * When `trackProgress` is true (default), `next` receives AugmentedChunk objects
     * with text, token count, and latency metadata. Set `trackProgress: false` for
     * plain text chunks.
     *
     * Usage:
     *   client.streamResponse('chat', 'What is the weather?').subscribe({
     *     next(chunk) { console.log(chunk.text, chunk.tokenIndex, chunk.elapsedMs); },
     *     error(err) { console.error(err); },
     *     complete() { console.log('done'); }
     *   });
     *
     *   client.streamResponse('code', 'Write a Python sort function').subscribe({…});
     *   client.streamResponse('audio', 'Explain sound waves').subscribe({…});
     */
    streamResponse(task: "chat" | "vision" | "code" | "audio" | "thinking", input: string, opts?: {
        trackProgress?: boolean;
        signal?: AbortSignal;
    }): {
        subscribe: (obs: {
            next: (chunk: string | AugmentedChunk) => void;
            error: (err: Error) => void;
            complete: (summary?: StreamSummary) => void;
        }) => void;
    };
};
export declare const client: {
    entities: {};
    capabilities: {};
    setConfig: (newConfig: any) => Promise<void>;
    /**
     * Reliably update client config after creation.
     * Updates the live closure variables so all integration methods
     * (InvokeLLM, websearch, toolbox, thinking, vision, expandQuery)
     * immediately use the new values. Also persists to localStorage.
     *
     * Usage:
     *   client.updateConfig({ model: 'gpt-oss:20b' });
     *   client.updateConfig({ ollamaEndpoints: ['http://my-host:11434'] });
     */
    updateConfig: (partial: Partial<{
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    }>) => void;
    /** Returns the current live config (reflects updateConfig changes). */
    getConfig: () => {
        serverUrl: string;
        appId: string;
        functionsVersion: string;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: string;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: typeof getEsConfig;
    saveEsConfig: typeof saveEsConfig;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: typeof getIndexPrefix;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: typeof setIndexPrefix;
    integrations: {
        Core: {
            vision: {
                /**
                 * Encode an image source into an OpenAI-compatible image_url string.
                 * Accepts:
                 *   - a dataUrl string ("data:image/...;base64,...")  → used as-is
                 *   - a raw base64 string (no prefix)                → wrapped with detected MIME
                 *   - a File / Blob object                           → read via FileReader
                 */
                encode(imageSource: string | File | Blob): Promise<string>;
                /**
                 * Send a vision request to Ollama's OpenAI-compatible /v1/chat/completions.
                 *
                 * When `schema` is provided, the response is parsed as JSON (code fences
                 * are stripped) and the parsed object is returned. Otherwise a
                 * { content, raw } object is returned.
                 *
                 * Usage (structured):
                 *   const result = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "Describe this image",
                 *     { type: "object", properties: { description: { type: "string" } } },
                 *     0,
                 *   );
                 *
                 * Usage (plain text):
                 *   const { content } = await client.integrations.Core.vision.send(
                 *     endpoint, model, dataUrl, "What is in this image?", null, 0,
                 *   );
                 */
                send(endpoint: string, model: string, imageBase64: string, prompt: string, schema?: Record<string, any> | null, temperature?: number, signal?: AbortSignal): Promise<any>;
            };
            /**
             * Expand a search query into 5-8 related terms using the LLM.
             * Returns an array always containing the original query plus expanded terms.
             * Usage:
             *   const terms = await client.integrations.Core.expandQuery("coral reefs");
             */
            expandQuery: (query: string, signal?: AbortSignal) => Promise<string[]>;
            /**
             * Run a solutions debate: prompt → keywords → 2 personas → LLM debate → solutions manifest.
             *
             * Flow:
             *   1. Converts the user prompt into focused search keywords.
             *   2. Queries two personas from Elasticsearch matching those keywords.
             *   3. Runs a multi-turn debate between the two personas (analyze → critique → refine).
             *   4. Produces a final solutions manifest with resolved approach and key arguments.
             *
             * Returns:
             *   { manifest, personas, debate }
             *
             * Usage:
             *   const { manifest, personas, debate } = await client.integrations.Core.solution(
             *     "How can we reduce plastic waste in the ocean?"
             *   );
             */
            solution: (prompt: string, signal?: AbortSignal) => Promise<{
                manifest: string;
                personas: any[];
                debate: string[];
            }>;
            thinking: (prompt: any) => Promise<ThinkingStreamingResult>;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<{
                thinking: any;
                content: any;
            }>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<void>;
            websearch: (params: any) => Promise<any>;
            toolbox: (params: any) => Promise<any>;
            InvokeLLM: (params: any) => Promise<any>;
            /**
             * Generate an embedding vector for the given text via the
             * OpenAI-compatible /v1/embeddings endpoint.
             *
             * Usage:
             *   const vec = await client.integrations.Core.vector("hello world");
             */
            vector(text: string, signal?: AbortSignal): Promise<number[] | null>;
            /**
             * Full vector pipeline: message → keywords → _all match search → reindex
             * matched docs into a dedicated vector index (created first with explicit
             * shard/replica settings) → embed single-value array fields (tags,
             * expertise_areas) as additional key embeddings via /v1/embeddings.
             *
             * Usage:
             *   const res = await client.integrations.Core.vectorIndex({ message: "..." });
             */
            vectorIndex(params: {
                message: string;
                targetIndex?: string;
                dims?: number;
                arrayFields?: string[];
                /** Field names to pull from matched docs and append to the vector-key embedding text. */
                keyNames?: string[];
                signal?: AbortSignal;
            }): Promise<{
                mode: "single";
                keywords: string[];
                sourceIndex: string;
                targetIndex: string;
                matchedCount: number;
                reindexStats: {
                    created: number;
                    updated: number;
                    srcIndex: string;
                }[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndices?: undefined;
            } | {
                mode: "multi";
                keywords: string[];
                sourceIndices: string[];
                targetIndex: string;
                matchedCount: number;
                reindexStats: any[];
                enrichedCount: number;
                vectorKey: number[];
                sourceIndex?: undefined;
            } | {
                mode: "all";
                keywords: string[];
                matchedCount: number;
                reindexStats: {
                    srcIndex: string;
                    created: number;
                    updated: number;
                }[];
                enrichedCount: number;
                targetIndex: string;
                vectorKey: number[];
                sourceIndex?: undefined;
                sourceIndices?: undefined;
            }>;
            InvokeLLMBatched: (...args: any[]) => Promise<string>;
            /**
             * Beam the same prompt to ALL available models in parallel and merge
             * results as structured JSON.
             *
             * Model selection: modelRouter.resolveAll(taskType, defaultModel) —
             * returns the full array of capability-matched models, fastest first.
             * Rate limit: always unlimited (no throttling) so all calls fire concurrently.
             *
             * Returns:
             *   {
             *     prompt: string,
             *     taskType: string,
             *     models: string[],
             *     results: Array<{
             *       model: string,
             *       status: 'fulfilled' | 'rejected',
             *       response: string | null,
             *       error: string | null,
             *       durationMs: number,
             *     }>
             *   }
             *
             * Usage:
             *   const beam = await client.integrations.Core.beaming(
             *     "What is the best way to clean an ocean?",
             *     { taskType: 'chat', signal }
             *   );
             *   beam.results.forEach(r => console.log(r.model, r.response));
             */
            beaming: (prompt: string, opts?: {
                taskType?: "chat" | "thinking" | "json" | "vision";
                signal?: AbortSignal;
                concurrency?: number;
            }) => Promise<{
                prompt: string;
                taskType: string;
                models: string[];
                results: Array<{
                    model: string;
                    status: "fulfilled" | "rejected";
                    response: string | null;
                    error: string | null;
                    durationMs: number;
                }>;
            }>;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    rateLimiter: RateLimiter;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    };
    circuitBreaker: {
        readonly state: "closed" | "open" | "half-open";
        canCall(): boolean;
        onSuccess(): void;
        onFailure(): void;
        reset(): void;
    };
    abortManager: {
        create(key?: string): AbortController;
        signal(key?: string): AbortSignal | undefined;
        cancel(key?: string): void;
        cancelAll(): void;
        isActive(key: string): boolean;
    };
    clientLogger: {
        log(level: "info" | "warn" | "error" | "debug", message: string, context?: Record<string, any>, durationMs?: number): void;
        info: (msg: string, ctx?: Record<string, any>) => void;
        warn: (msg: string, ctx?: Record<string, any>) => void;
        error: (msg: string, ctx?: Record<string, any>) => void;
        timed: <T>(label: string, fn: () => Promise<T>, ctx?: Record<string, any>) => Promise<T>;
    };
    telemetry: {
        on(event: import("@/apis/lib/telemetry").TelemetryEvent, handler: (payload: Record<string, any>) => void): () => boolean;
        emit(event: import("@/apis/lib/telemetry").TelemetryEvent, payload?: Record<string, any>): void;
    };
    toolRegistry: {
        register(name: string, handler: (...args: any[]) => Promise<any>): void;
        unregister(name: string): void;
        call(name: string, ...args: any[]): Promise<any>;
        has(name: string): boolean;
        list(): string[];
        toCoreIntegrations(): Record<string, (...args: any[]) => Promise<any>>;
    };
    modelRouter: {
        readonly capabilityCache: Record<string, Record<string, number>> | null;
        invalidateCache(): void;
        resolve(taskTypeOrOpts: import("@/apis/lib/model-router").TaskType | import("@/apis/lib/model-router").ResolveOptions, _prompt?: string, defaultModel?: string, priority?: import("@/apis/lib/model-router").ModelPriority): string;
        registerTaskType(taskType: string, capabilities: string[]): void;
        readonly taskCapabilities: Record<string, string[]>;
        resolveAll(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string): string[];
        resolveAsync(taskType: import("@/apis/lib/model-router").TaskType, defaultModel: string, _priority?: import("@/apis/lib/model-router").ModelPriority): Promise<string>;
    };
    promptRouter: {
        enhance(raw: string, opts?: import("@/apis/lib/prompt-router").EnhanceOptions): Promise<string>;
    };
    authMiddleware: {
        injectAuthHeaders: (existing?: Record<string, string>) => Record<string, string>;
        withAuth: (url: string, init?: RequestInit) => Promise<Response>;
    };
    esEntities: {};
    esEndpoint: any;
    /**
     * Retrieve the full messages array of a ChatSession by its ID.
     *
     * Usage:
     *   const messages = await client.getMessages('session-id-123');
     */
    getMessages(sessionId: string): Promise<any[]>;
    /**
     * Stream a response token-by-token for any supported task.
     *
     * Supported tasks: 'chat', 'vision', 'code', 'audio'.
     * When `trackProgress` is true (default), `next` receives AugmentedChunk objects
     * with text, token count, and latency metadata. Set `trackProgress: false` for
     * plain text chunks.
     *
     * Usage:
     *   client.streamResponse('chat', 'What is the weather?').subscribe({
     *     next(chunk) { console.log(chunk.text, chunk.tokenIndex, chunk.elapsedMs); },
     *     error(err) { console.error(err); },
     *     complete() { console.log('done'); }
     *   });
     *
     *   client.streamResponse('code', 'Write a Python sort function').subscribe({…});
     *   client.streamResponse('audio', 'Explain sound waves').subscribe({…});
     */
    streamResponse(task: "chat" | "vision" | "code" | "audio" | "thinking", input: string, opts?: {
        trackProgress?: boolean;
        signal?: AbortSignal;
    }): {
        subscribe: (obs: {
            next: (chunk: string | AugmentedChunk) => void;
            error: (err: Error) => void;
            complete: (summary?: StreamSummary) => void;
        }) => void;
    };
};
export { esEntities, getEsConfig, saveEsConfig, createEsEntities, getIndexPrefix, setIndexPrefix };
