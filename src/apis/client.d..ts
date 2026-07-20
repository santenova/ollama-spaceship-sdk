import { createEsEntities, getEsConfig, saveEsConfig, esEntities, getIndexPrefix, setIndexPrefix } from "@/apis/lib/es-entities";
import { clientLogger } from "@/apis/lib/client-logger";
export { clientLogger };
import { type AugmentedChunk, type StreamSummary } from "@/apis/lib/progress-tracker";
export declare const _local = true;
export declare function dumpObject(obj: any): void;
export declare function createAxiosClient({ baseURL, headers, token, interceptResponses }: {
    baseURL: any;
    headers: any;
    token: any;
    interceptResponses?: boolean | undefined;
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
export declare const getOllamaEndpoint: () => "http://127.0.0.1:11434" | "/proxy" | "https://christy-ramentaceous-verbatim.ngrok-free.dev";
/**
 * Returns the Elasticsearch endpoint.
 * - browser + local  → '/db'  (Vite dev proxy)
 * - Node   + local   → 'http://127.0.0.1:9200'  (direct)
 * - remote           → ngrok public URL
 */
export declare const getElasticsearchEndpoint: () => "https://eu-vector-cloud.ngrok.dev" | "/db" | "http://127.0.0.1:9200";
export declare const createOllamaClient: (apiKey?: string) => {
    apiKey: string | undefined;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: any;
    saveEsConfig: any;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: any;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: any;
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
            expandQuery: (query: string, signal?: AbortSignal) => any;
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
            solution: (prompt: string, signal?: AbortSignal) => any;
            thinking: (prompt: any) => any;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<any>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<any>;
            websearch: (params: any) => any;
            toolbox: (params: any) => any;
            InvokeLLM: (params: any) => any;
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
            }): Promise<any>;
            InvokeLLMBatched: any;
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
            }) => any;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    readonly rateLimiter: any;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    } | null;
    circuitBreaker: any;
    abortManager: any;
    clientLogger: any;
    telemetry: any;
    toolRegistry: any;
    modelRouter: any;
    promptRouter: any;
    authMiddleware: any;
    esEntities: any;
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
    appId: any;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: any;
    saveEsConfig: any;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: any;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: any;
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
            expandQuery: (query: string, signal?: AbortSignal) => any;
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
            solution: (prompt: string, signal?: AbortSignal) => any;
            thinking: (prompt: any) => any;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<any>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<any>;
            websearch: (params: any) => any;
            toolbox: (params: any) => any;
            InvokeLLM: (params: any) => any;
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
            }): Promise<any>;
            InvokeLLMBatched: any;
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
            }) => any;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    readonly rateLimiter: any;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    } | null;
    circuitBreaker: any;
    abortManager: any;
    clientLogger: any;
    telemetry: any;
    toolRegistry: any;
    modelRouter: any;
    promptRouter: any;
    authMiddleware: any;
    esEntities: any;
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
    entities: any;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: any;
    saveEsConfig: any;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: any;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: any;
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
            expandQuery: (query: string, signal?: AbortSignal) => any;
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
            solution: (prompt: string, signal?: AbortSignal) => any;
            thinking: (prompt: any) => any;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<any>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<any>;
            websearch: (params: any) => any;
            toolbox: (params: any) => any;
            InvokeLLM: (params: any) => any;
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
            }): Promise<any>;
            InvokeLLMBatched: any;
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
            }) => any;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    rateLimiter: any;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    } | null;
    circuitBreaker: any;
    abortManager: any;
    clientLogger: any;
    telemetry: any;
    toolRegistry: any;
    modelRouter: any;
    promptRouter: any;
    authMiddleware: any;
    esEntities: any;
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
export declare const esConfig: any;
export declare const baseClient: {
    entities: any;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: any;
    saveEsConfig: any;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: any;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: any;
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
            expandQuery: (query: string, signal?: AbortSignal) => any;
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
            solution: (prompt: string, signal?: AbortSignal) => any;
            thinking: (prompt: any) => any;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<any>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<any>;
            websearch: (params: any) => any;
            toolbox: (params: any) => any;
            InvokeLLM: (params: any) => any;
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
            }): Promise<any>;
            InvokeLLMBatched: any;
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
            }) => any;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    rateLimiter: any;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    } | null;
    circuitBreaker: any;
    abortManager: any;
    clientLogger: any;
    telemetry: any;
    toolRegistry: any;
    modelRouter: any;
    promptRouter: any;
    authMiddleware: any;
    esEntities: any;
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
    entities: any;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
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
        functionsVersion: string | undefined;
        headers: Record<string, string>;
        model: string;
        ollamaEndpoints: string[];
        indexPrefix: any;
        messages?: any[];
        /** Rate limit settings; null/undefined = unlimited (no throttling). */
        rateLimit?: {
            maxCalls?: number;
            windowMs?: number;
        } | null;
    };
    getEsConfig: any;
    saveEsConfig: any;
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix: any;
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix: any;
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
            expandQuery: (query: string, signal?: AbortSignal) => any;
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
            solution: (prompt: string, signal?: AbortSignal) => any;
            thinking: (prompt: any) => any;
            thinkingEnabled: (prompt: string, signal?: AbortSignal) => Promise<any>;
            thinkingLevels: (prompt: string, signal?: AbortSignal) => Promise<any>;
            websearch: (params: any) => any;
            toolbox: (params: any) => any;
            InvokeLLM: (params: any) => any;
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
            }): Promise<any>;
            InvokeLLMBatched: any;
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
            }) => any;
            UploadFile: () => Promise<void>;
            SendEmail: () => Promise<void>;
            GenerateImage: () => Promise<void>;
            ExtractDataFromUploadedFile: () => Promise<void>;
        };
    };
    rateLimiter: any;
    setLimits: (limits: {
        maxCalls?: number;
        windowMs?: number;
    } | null) => void;
    getLimits: () => {
        maxCalls?: number;
        windowMs?: number;
    } | null;
    circuitBreaker: any;
    abortManager: any;
    clientLogger: any;
    telemetry: any;
    toolRegistry: any;
    modelRouter: any;
    promptRouter: any;
    authMiddleware: any;
    esEntities: any;
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
