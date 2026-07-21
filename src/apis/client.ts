import axios from 'axios'; // Import axios directly

import { appParams, appId, token, functionsVersion, appBaseUrl, getAppParams, localStorage, LS_PREFIX } from "./lib/app-params";

import { createEsEntities, getEsConfig, saveEsConfig, esEntities, getIndexPrefix, setIndexPrefix } from "./lib/es-entities";
import { validateClientConfig } from "./lib/config-schema";
import { clientLogger } from "./lib/client-logger";
export { clientLogger };
import { createCircuitBreaker } from "./lib/circuit-breaker";
import { telemetry } from "./lib/telemetry";
import { toolRegistry } from "./lib/tool-registry";
import { modelRouter } from "./lib/model-router";
import { promptRouter } from "./lib/prompt-router";
import { createBatcher } from "./lib/request-batcher";
import { createAuthMiddleware } from "./lib/auth-middleware";
import { trackedOllamaFetch } from "./lib/ollama-tracker";
import { abortManager } from "./lib/abort-manager";
import { webSearch } from "../apis/modules/websearch/websearch-tools";
import { multiToolRun } from "../apis/modules/tools/multi-tool";
import { thinkingLevels } from "../apis/modules/thinking/thinking-levels";
import { flightTracker } from "../apis/modules/tools/flight-tracker";
import { calculator } from "../apis/modules/tools/calculator";
import { vectorPipeline } from "./modules/vector/vector-pipeline";
import { safeExecute } from "./lib/safe-execute";
import { TelemetryEvents } from "./lib/telemetry-events";
import { endpointRegistry } from "./lib/endpoint-registry";
import { expandQuery as _expandQuery, solution as _solution, beaming as _beaming } from "./lib/task-orchestrator";
import { createRateLimiter, type RateLimiter } from "./lib/rate-limiter";
import { createProgressTracker, type AugmentedChunk, type StreamSummary } from "./lib/progress-tracker";
import { LocationService } from "./lib/location";

interface ToolSchema {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export const _local = true;
// Dump localStorage as a table
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
export async function thinkingStreamingFetch(
  prompt: string,
  config: ThinkingStreamingConfig,
): Promise<ThinkingStreamingResult> {
  const host =
    config.ollamaEndpoints[1] ||
    config.ollamaEndpoints[0] ||
    'http://localhost:11434';
  const useModel =
    config.model || config.defaultModel || 'qwen3:0.6b';

  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: useModel,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      think: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`thinkingStreamingFetch error: ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let thinkBuf = '';
  let contentBuf = '';
  let chunks = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks++;
    for (const line of decoder.decode(value).split('\n')) {
      const trimmed = line.replace(/^data:\s*/, '').trim();
      if (!trimmed || trimmed === '[DONE]') continue;
      try {
        const json = JSON.parse(trimmed);
        const delta = json?.choices?.[0]?.delta;
        if (delta?.thinking) thinkBuf += delta.thinking;
        if (delta?.content) contentBuf += delta.content;
      } catch {
        // partial JSON across chunk boundaries — skip
      }
    }
  }

  return { thinking: thinkBuf, content: contentBuf, chunks };
}

export async function thinkingEnabled(prompt, config) {
    const host = config.ollamaEndpoints[1] ||
        config.ollamaEndpoints[0] ||
        'http://localhost:11434';
    const useModel = config.model || config.defaultModel || 'qwen3:0.6b';
    const res = await fetch(`${host}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: useModel,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            think: true,
        }),
    });
    if (!res.ok) {
        throw new Error(`thinkingEnabled error: ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const data = await res.json();
    const message = data?.choices?.[0]?.message ?? {};
    return {
        thinking: message.thinking ?? '',
        content: message.content ?? '',
    };
}

export function dumpObject(obj) {
  if (obj) {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      console.log("obj is empty.");
      return;
    }

    console.log(JSON.stringify(obj));
  }
}

// Refactor createAxiosClient to a direct Axios implementation
export function createAxiosClient({ baseURL, headers, token, interceptResponses = false }) {
  const instance = axios.create({
    baseURL: baseURL,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (interceptResponses) {
    instance.interceptors.response.use(
      response => response,
      error => {
        return Promise.reject(error);
      }
    );
  }

  return instance;  
}

export function isLocalMode() {
  try {
    const prefix = (globalThis as any).import?.meta?.env?.APP_PREFIX;
    const s = localStorage.getItem(prefix + "_settings");
    return s ? JSON.parse(s).local_mode === true : false;
  } catch {
    return false;
  }
}

export const serverUrl = "https://eu-vector-cloud.ngrok.dev";
export const headers = {
    ...{},
    "X-App-Id": String(appId),
  };
export const axiosClient = createAxiosClient({
    baseURL: `${serverUrl}/api`,
    headers,
    token
  });





/**
 * Determines the appropriate endpoint for making API requests based on environment variables and predefined endpoints.
 * 
 * @returns A string representing the selected endpoint.
 */
const _isBrowser = typeof globalThis !== 'undefined' && typeof (globalThis as any).window !== 'undefined';

const _isLocal = () => {
  const host = _isBrowser
    ? (globalThis as any).window.location.hostname
    : (process.env.HOSTNAME || '127.0.0.1');
  return host === 'localhost'  ||  host === '127.0.0.1'  || host === '127.0.0.1' || host.startsWith('192.168.');
};

/**
 * Returns the Ollama endpoint.
 * - browser + local  → '/proxy'  (Vite dev proxy)
 * - Node   + local   → 'http://127.0.0.1:11434'  (direct)
 * - remote           → ngrok public URL
 */
export const getOllamaEndpoint = () => {
  if (_isLocal()) {
    return _isBrowser ? '/proxy' : 'http://127.0.0.1:11434';
  }
  return 'https://christy-ramentaceous-verbatim.ngrok-free.dev';
};

/**
 * Returns the Elasticsearch endpoint.
 * - browser + local  → '/db'  (Vite dev proxy)
 * - Node   + local   → 'http://127.0.0.1:9200'  (direct)
 * - remote           → ngrok public URL
 */
export const getElasticsearchEndpoint = () => {
  if (_isLocal()) {
    return _isBrowser ? '/db' : 'http://127.0.0.1:9200';
  }
  return 'https://eu-vector-cloud.ngrok.dev';
};



export const createOllamaClient = (apiKey?: string) => {
  return { apiKey };
}



/**
 * Standalone InvokeLLM — calls Ollama's OpenAI-compatible /v1/chat/completions endpoint.
 * Returns parsed JSON when response_json_schema is provided, otherwise plain text.
 */
export async function invokeLLM(opts: {
  prompt?: string;
  /** OpenAI-style messages array — takes precedence over `prompt` when provided. */
  messages?: Array<{ role: string; content: string }>;
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
}) {
  const {
    prompt,
    messages: callerMessages,
    system = null,
    add_context_from_internet = false,
    response_json_schema = null,
    file_urls = null,
    model: requestedModel = null,
    temperature,
    think = false,
    stream = false,
    onToken,
    tools,
    returnRaw = false,
    signal,
    ollamaEndpoints,
    defaultModel,
  } = opts || {};

  const endpoint =
    (ollamaEndpoints[0] || ollamaEndpoints[1] || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const useModel = requestedModel || defaultModel || 'qwen3:0.6b';

  // Build the messages array — OpenAI Chat Completions spec
  const messages: Array<{ role: string; content: string }> = [];

  // 1. System message (persona instructions) first
  if (system) {
    messages.push({ role: 'system', content: system });
  }

  // 2. Web search context (injected as system message)
  if (add_context_from_internet) {
    try {
      const results = await webSearch({ prompt: prompt || '', ollamaEndpoints, defaultModel });
      if (results) {
        const contextStr =
          typeof results === 'string' ? results : JSON.stringify(results);
        messages.push({
          role: 'system',
          content: `Use the following web search results to inform your response:\n\n${contextStr}`,
        });
      }
    } catch {}
  }

  // 3. Caller-provided messages take precedence; otherwise build from prompt
  if (callerMessages && callerMessages.length > 0) {
    messages.push(...callerMessages);
  } else if (prompt) {
    messages.push({ role: 'user', content: prompt });
  } else if (messages.length === 0) {
    throw new Error('InvokeLLM requires either a "prompt" or "messages" parameter.');
  }

  // 4. File URLs appended as system context
  if (file_urls) {
    const urls = Array.isArray(file_urls) ? file_urls : [file_urls];
    messages.push({
      role: 'system',
      content: `Reference files provided by the user: ${urls.join(', ')}`,
    });
  }

  const body: Record<string, any> = {
    model: useModel,
    messages,
    stream,
  };

  if (temperature !== undefined && temperature !== null) {
    body.temperature = temperature;
  }

  if (think) {
    body.think = true;
  }

  if (tools) {
    body.tools = tools;
  }

  if (response_json_schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'response',
        schema: response_json_schema,
        strict: false,
      },
    };
  }

  const res = await trackedOllamaFetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }, 'InvokeLLM');

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      `InvokeLLM error: ${res.status} ${res.statusText}${errText ? ` — ${errText}` : ''}`
    );
  }

  // Streaming mode — delegate SSE parsing to shared helper
  if (stream && res.body) {
    let content = '';
    await parseSSEStream(res, (delta: string) => {
      content += delta;
      onToken?.(delta);
    });
    if (response_json_schema) {
      try { return JSON.parse(content); } catch { return content; }
    }
    return content;
  }

  const data = await res.json();

  // When tools or returnRaw are requested, return the full response object
  // so callers can inspect tool_calls, thinking traces, etc.
  if (tools || returnRaw) {
    return data;
  }

  const content = (data as any)?.choices?.[0]?.message?.content ?? '';

  if (response_json_schema) {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  return content;
}

// SSE parsing delegated to openai-fetch.parseSSE (shared helper)
import { parseSSE as parseSSEStream } from './lib/openai-fetch';

export function createClient(config: {
  serverUrl: string;
  appId: string;
  functionsVersion?: string;
  headers: Record<string, string>;
  model: string;
  ollamaEndpoints: string[];
  messages?: any[];
  /** Rate limit settings; null/undefined = unlimited (no throttling). */
  rateLimit?: { maxCalls?: number; windowMs?: number } | null;
}) {
  // ── #1: Validate config schema before proceeding ──
  const validation = validateClientConfig(config);
  if (!validation.valid) {
    clientLogger.warn('createClient: config validation issues', { errors: validation.errors });
  }

  // ── #2: Auth middleware for token injection ──
  const authMiddleware = createAuthMiddleware({
    getToken: () => {
      try { return localStorage.getItem(`${LS_PREFIX}token`) || null; } catch { return null; }
    },
  });

  // ── #3: Circuit breaker for primary API ──
  const circuitBreaker = createCircuitBreaker('primary-api', {
    failureThreshold: 3,
    recoveryTimeMs: 30_000,
    onStateChange: (state) => {
      if (state === 'open') telemetry.emit(TelemetryEvents.CIRCUIT_OPEN, { name: 'primary-api' });
      if (state === 'closed') telemetry.emit(TelemetryEvents.CIRCUIT_CLOSED, { name: 'primary-api' });
    },
  });

  // ── Failsafe: load context from localStorage and merge into config ──
  let resolvedServerUrl = config.serverUrl;
  let resolvedAppId = config.appId;
  let resolvedFunctionsVersion = config.functionsVersion;
  let resolvedHeaders = config.headers;
  let resolvedModel = config.model;
  let resolvedOllamaEndpoints = config.ollamaEndpoints;

  try {
    {
      const ls = localStorage;

      // Merge stored values for any config fields not explicitly provided
      const storedServerUrl = ls.getItem(`${LS_PREFIX}server_url`);
      if (storedServerUrl && !resolvedServerUrl) resolvedServerUrl = storedServerUrl;

      const storedAppId = ls.getItem(`${LS_PREFIX}app_id`);
      if (storedAppId && !resolvedAppId) resolvedAppId = storedAppId;

      const storedFunctionsVersion = ls.getItem(`${LS_PREFIX}functions_version`);
      if (storedFunctionsVersion && !resolvedFunctionsVersion) resolvedFunctionsVersion = storedFunctionsVersion;

      const storedModel = ls.getItem(`${LS_PREFIX}default_model`) || ls.getItem('ollama_default_model');
      if (storedModel && !resolvedModel) resolvedModel = storedModel;

      // Endpoints: stored as JSON array under 'ollama_endpoints'
      const storedEndpointsRaw = ls.getItem('ollama_endpoints');
      if (storedEndpointsRaw) {
        try {
          const parsed = JSON.parse(storedEndpointsRaw);
          if (Array.isArray(parsed) && parsed.length > 0 && (!resolvedOllamaEndpoints || resolvedOllamaEndpoints.length === 0)) {
            resolvedOllamaEndpoints = parsed;
          }
        } catch {}
      }

      // Merge stored headers
      const storedHeadersRaw = ls.getItem(`${LS_PREFIX}headers`);
      if (storedHeadersRaw) {
        try {
          const parsedHeaders = JSON.parse(storedHeadersRaw);
          if (parsedHeaders && typeof parsedHeaders === 'object') {
            resolvedHeaders = { ...parsedHeaders, ...resolvedHeaders };
          }
        } catch {}
      }

      // Persist resolved values back to localStorage for next load
      if (resolvedServerUrl) ls.setItem(`${LS_PREFIX}server_url`, resolvedServerUrl);
      if (resolvedAppId) ls.setItem(`${LS_PREFIX}app_id`, resolvedAppId);
      if (resolvedFunctionsVersion) ls.setItem(`${LS_PREFIX}functions_version`, String(resolvedFunctionsVersion));
      if (resolvedModel) ls.setItem(`${LS_PREFIX}default_model`, resolvedModel);
      if (resolvedOllamaEndpoints?.length) ls.setItem('ollama_endpoints', JSON.stringify(resolvedOllamaEndpoints));
      if (resolvedHeaders) ls.setItem(`${LS_PREFIX}headers`, JSON.stringify(resolvedHeaders));
    }
  } catch (e) {
    // localStorage may be unavailable (SSR, privacy mode) — fail silently with config as-is
    console.warn('createClient: localStorage context load/store skipped —', e?.message || e);
  }

  const configResolved = {
    ...config,
    serverUrl: resolvedServerUrl,
    appId: resolvedAppId,
    functionsVersion: resolvedFunctionsVersion,
    headers: resolvedHeaders,
    model: resolvedModel,
    ollamaEndpoints: resolvedOllamaEndpoints,
    indexPrefix: getIndexPrefix(),
  };

  const { headers: _h, model: _m, ollamaEndpoints: _o, messages: _msgs } = configResolved;

  let modelName = resolvedModel;
  let lastUserMessagePromptText = '';

  // ── Warm capability cache in background (non-blocking) ──
  modelRouter.resolveAsync('chat', resolvedModel).catch(() => {});

  // ── #6: Register default tools — guard to avoid duplicate registration on hot-reload ──
  const registerIfMissing = (name: string, fn: any) => {
    if (!toolRegistry.has?.(name)) toolRegistry.register(name, fn);
  };
  registerIfMissing('InvokeLLM', (params) =>
    invokeLLM({ ...params, ollamaEndpoints: resolvedOllamaEndpoints, defaultModel: resolvedModel })
  );
  registerIfMissing('websearch', (params) =>
    webSearch({ ...params, ollamaEndpoints: resolvedOllamaEndpoints, defaultModel: resolvedModel })
  );
  registerIfMissing('toolbox', (params) =>
    multiToolRun({ ...params, ollamaEndpoints: resolvedOllamaEndpoints, defaultModel: resolvedModel })
  );
  registerIfMissing('flightTracker', (params) =>
    flightTracker({ ...params, ollamaEndpoints: resolvedOllamaEndpoints, defaultModel: resolvedModel })
  );
  registerIfMissing('calculator', (params) =>
    calculator({ ...params, ollamaEndpoints: resolvedOllamaEndpoints, defaultModel: resolvedModel })
  );

  // ── #5: LLM request batcher — allSettled so one failure doesn't cancel the whole batch ──
  const batchedInvoke = createBatcher<string>(
    async (batchArgs) => {
      const settled = await Promise.allSettled(
        batchArgs.map(([params]) =>
          invokeLLM({ ...params, ollamaEndpoints: resolvedOllamaEndpoints, defaultModel: resolvedModel })
        )
      );
      return settled.map(r => r.status === 'fulfilled' ? r.value : Promise.reject((r as PromiseRejectedResult).reason));
    }
  );

  // ── Rate limiter (from config.rateLimit; null/undefined = unlimited) ──
  let rateLimitConfig = configResolved.rateLimit ?? null;
  let rateLimiter = createRateLimiter('llm-api', rateLimitConfig ?? { unlimited: true });

  const client =
        { entities:[
          { name: 'Persona', defaultIndex: 'sample-prompt-persona'},
          { name: 'Template', defaultIndex: 'sample-prompt-template'},
          { name: 'ChatSession', defaultIndex: 'sample-prompt-session'},
          { name: 'Scenario', defaultIndex: 'sample-prompt-scenario'},
          { name: 'DevilsAdvocateResult', defaultIndex: 'sample-prompt-devils'},
          { name: 'AnalogyBuilderResult', defaultIndex: 'sample-prompt-analogy'},
          { name: 'PersonaDebateResult', defaultIndex: 'sample-prompt-debate'},
          { name: 'ContentRepurposerResult', defaultIndex: 'sample-prompt-repurpose'},
          { name: 'StructureArchitectResult', defaultIndex: 'sample-prompt-outline'},
          { name: 'GeneratorList', defaultIndex: 'sample-prompt-generator-list'}
        ],
    capabilities:{},
    setConfig: async (newConfig) => {
      saveEsConfig(newConfig);
    },
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
    updateConfig: (partial: Partial<typeof configResolved>) => {
      if (partial.model !== undefined) {
        resolvedModel = partial.model;
        configResolved.model = partial.model;
        try { localStorage.setItem(`${LS_PREFIX}default_model`, partial.model); } catch {}
      }
      if (partial.ollamaEndpoints !== undefined) {
        resolvedOllamaEndpoints = partial.ollamaEndpoints;
        configResolved.ollamaEndpoints = partial.ollamaEndpoints;
        try { localStorage.setItem('ollama_endpoints', JSON.stringify(partial.ollamaEndpoints)); } catch {}
      }
      if (partial.serverUrl !== undefined) {
        resolvedServerUrl = partial.serverUrl;
        configResolved.serverUrl = partial.serverUrl;
        try { localStorage.setItem(`${LS_PREFIX}server_url`, partial.serverUrl); } catch {}
      }
      if (partial.appId !== undefined) {
        resolvedAppId = partial.appId;
        configResolved.appId = partial.appId;
        try { localStorage.setItem(`${LS_PREFIX}app_id`, partial.appId); } catch {}
      }
      if (partial.headers !== undefined) {
        resolvedHeaders = { ...resolvedHeaders, ...partial.headers };
        configResolved.headers = resolvedHeaders;
        try { localStorage.setItem(`${LS_PREFIX}headers`, JSON.stringify(resolvedHeaders)); } catch {}
      }
      if (partial.functionsVersion !== undefined) {
        resolvedFunctionsVersion = partial.functionsVersion;
        configResolved.functionsVersion = partial.functionsVersion;
        try { localStorage.setItem(`${LS_PREFIX}functions_version`, String(partial.functionsVersion)); } catch {}
      }
      if (partial.indexPrefix !== undefined) {
        setIndexPrefix(partial.indexPrefix);
        configResolved.indexPrefix = partial.indexPrefix;
      }
      // Re-warm model router cache with new model
      modelRouter.resolveAsync('chat', resolvedModel).catch(() => {});
    },
    /** Returns the current live config (reflects updateConfig changes). */
    getConfig: () => ({ ...configResolved }),
    getEsConfig,
    saveEsConfig,
    /** Global ES index prefix (default "prompt-hub"). */
    getIndexPrefix,
    /** Change the global ES index prefix (e.g. "sample-data") and rebuild index mappings. */
    setIndexPrefix,
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
            async encode(imageSource: string | File | Blob): Promise<string> {
              if (typeof imageSource === 'string') {
                if (imageSource.startsWith('data:')) return imageSource;
                // Detect actual image format from the base64 signature so the
                // data URL matches the real bytes — a PNG wrapped as jpeg causes
                // "flate: corrupt input" decode errors in vision models.
                const mime = imageSource.startsWith('iVBORw0KGgo') ? 'image/png'
                  : imageSource.startsWith('/9j/') ? 'image/jpeg'
                  : imageSource.startsWith('R0lGOD') ? 'image/gif'
                  : imageSource.startsWith('UklGR') ? 'image/webp'
                  : 'image/jpeg';
                return `data:${mime};base64,${imageSource}`;
              }
              // File / Blob — read asynchronously
              return new Promise((resolve, reject) => {
                const reader = new (globalThis as any).FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read image file'));
                reader.readAsDataURL(imageSource);
              });
            },

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
            async send(endpoint: string, model: string, imageBase64: string, prompt: string, schema?: Record<string, any> | null, temperature?: number, signal?: AbortSignal): Promise<any> {
              const dataUrl = await this.encode(imageBase64);

              const body: Record<string, any> = {
                model,
                messages: [{ role: "user", content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: dataUrl } },
                ]}],
                temperature: temperature ?? 0,
              };

              if (schema) {
                body.response_format = { type: "json_schema", json_schema: { name: "result", strict: false, schema } };
              }

              const response = await trackedOllamaFetch(`${endpoint.replace(/\/$/, '')}/v1/chat/completions`, {
                method: "POST",
                headers: authMiddleware.injectAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(body),
                signal,
              }, 'vision.send');

              if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`Local LMS error: ${response.status} ${response.statusText} — ${errText}`);
              }

              const raw: any = await response.json();
              let content = raw?.choices?.[0]?.message?.content ?? "{}";

              if (schema) {
                if (typeof content === "string") {
                  content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
                  return JSON.parse(content);
                }
                return content;
              }

              return { content, raw };
            },
          },
          /**
           * Expand a search query into 5-8 related terms using the LLM.
           * Returns an array always containing the original query plus expanded terms.
           * Usage:
           *   const terms = await client.integrations.Core.expandQuery("coral reefs");
           */
          expandQuery: (query: string, signal?: AbortSignal) =>
            _expandQuery(query, resolvedOllamaEndpoints, resolvedModel, signal),
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
          solution: (prompt: string, signal?: AbortSignal) =>
            _solution(prompt, resolvedOllamaEndpoints, resolvedModel, signal),
          thinking: (prompt) => thinkingStreamingFetch(prompt, { ollamaEndpoints: resolvedOllamaEndpoints, model: resolvedModel }),
          thinkingEnabled: async (prompt: string, signal?: AbortSignal) => {
            return thinkingEnabled(prompt, {
              ollamaEndpoints: resolvedOllamaEndpoints,
              model: modelRouter.resolve('thinking', prompt, resolvedModel),
            });
          },
          thinkingLevels: async (prompt: string, signal?: AbortSignal) => {
            return thinkingLevels(prompt, {
              ollamaEndpoints: resolvedOllamaEndpoints,
              model: modelRouter.resolve('thinking', prompt, resolvedModel),
            });
          },
          websearch: (params) => {
            // #8: Route to best model for websearch task
            const routedModel = modelRouter.resolve('websearch', params?.prompt || '', resolvedModel);
            telemetry.emit(TelemetryEvents.MODEL_ROUTED, { task: 'websearch', model: routedModel });
            return clientLogger.timed('websearch', () =>
              webSearch({ ...params, ollamaEndpoints: resolvedOllamaEndpoints, defaultModel: routedModel })
            );
          },
          toolbox: (params) => {
            const routedModel = modelRouter.resolve('tool_call', params?.prompt || '', resolvedModel);
            return clientLogger.timed('toolbox', () =>
              multiToolRun({ ...params, ollamaEndpoints: resolvedOllamaEndpoints, defaultModel: routedModel })
            );
          },
          InvokeLLM: (params) => {
            const taskType = params?.response_json_schema ? 'json' : 'chat';
            const routeText = params?.prompt
              || (params?.messages?.length
                ? [...params.messages].reverse().find((m: any) => m.role === 'user')?.content || ''
                : '');
            const routedModel = modelRouter.resolve(taskType, routeText, resolvedModel);
            const callId = `InvokeLLM-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const controller = abortManager.create(callId);
            telemetry.emit(TelemetryEvents.MODEL_ROUTED, { task: taskType, model: routedModel });
            return safeExecute({
              label: 'InvokeLLM',
              fn: () => rateLimiter.run(() =>
                invokeLLM({ ...params, signal: controller.signal, ollamaEndpoints: resolvedOllamaEndpoints, defaultModel: routedModel })
              ),
              circuitBreaker,
            }).finally(() => abortManager.cancel(callId));
          },
          // #5: Batched variant for parallel calls
          /**
           * Generate an embedding vector for the given text via the
           * OpenAI-compatible /v1/embeddings endpoint.
           *
           * Usage:
           *   const vec = await client.integrations.Core.vector("hello world");
           */
          async vector(text: string, signal?: AbortSignal): Promise<number[] | null> {
            if (!text?.trim()) return null;
            // #1: Circuit breaker guard
            if (!circuitBreaker.canCall()) {
              throw new Error('Circuit breaker open — Ollama unavailable');
            }
            return rateLimiter.run(async () => {
              const endpoint = (resolvedOllamaEndpoints[0] || resolvedOllamaEndpoints[1] || 'http://127.0.0.1:11434').replace(/\/$/, '');
              const useModel = modelRouter.resolve({ TaskType: 'embedding', Speed: 100, defaultModel: 'nomic-embed-text' });
              const controller = new AbortController();
              if (signal) signal.addEventListener('abort', () => controller.abort());
              const timeout = setTimeout(() => controller.abort(), 60_000);

              try {
                const result = await clientLogger.timed('vector', async () => {
                  const res = await trackedOllamaFetch(`${endpoint}/v1/embeddings`, {
                    method: 'POST',
                    headers: authMiddleware.injectAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ model: useModel, input: text }),
                    signal: controller.signal,
                  }, 'vector');
                  if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    throw new Error(`vector error: ${res.status} ${res.statusText}${errText ? ` — ${errText}` : ''}`);
                  }
                  const json: any = await res.json();
                  return json?.data?.[0]?.embedding || json?.embedding || null;
                }, { model: useModel, textLen: text.length });
                circuitBreaker.onSuccess();
                return result;
              } catch (err) {
                circuitBreaker.onFailure();
                throw err;
              } finally {
                clearTimeout(timeout);
              }
            });
          },
          /**
           * Full vector pipeline: message → keywords → _all match search → reindex
           * matched docs into a dedicated vector index (created first with explicit
           * shard/replica settings) → embed single-value array fields (tags,
           * expertise_areas) as additional key embeddings via /v1/embeddings.
           *
           * Usage:
           *   const res = await client.integrations.Core.vectorIndex({ message: "..." });
           */
          async vectorIndex(params: {
            message: string;
            targetIndex?: string;
            dims?: number;
            arrayFields?: string[];
            /** Field names to pull from matched docs and append to the vector-key embedding text. */
            keyNames?: string[];
            signal?: AbortSignal;
          }) {
            // Read ES config once — reused below to avoid double localStorage parse
            const esCfg = getEsConfig();
            const result = await clientLogger.timed('vectorIndex', () =>
              vectorPipeline({
                message: params.message,
                ollamaEndpoints: resolvedOllamaEndpoints,
                chatModel: resolvedModel,
                embeddingModel: modelRouter.resolve({ TaskType: 'embedding', Speed: 100, defaultModel: 'nomic-embed-text' }),
                esEndpoint: esCfg.endpoint,
                targetIndex: params.targetIndex,
                dims: params.dims,
                arrayFields: params.arrayFields,
                keyNames: params.keyNames,
                signal: params.signal,
              })
            );

            if (result?.targetIndex) {
              const entityName = result.targetIndex
                .replace(/^bulk-reindex-/, '')
                .replace(/-\d+$/, '')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, (c: string) => c.toUpperCase())
                .replace(/\s+/g, '');

              const entityArr = (defaultClient as any).entities;
              if (Array.isArray(entityArr) && !entityArr.some((e: any) => e.defaultIndex === result.targetIndex)) {
                entityArr.push({ name: entityName, defaultIndex: result.targetIndex });
              }

              if (!esCfg.indices[entityName]) {
                esCfg.indices[entityName] = result.targetIndex;
                saveEsConfig(esCfg);
              }

              telemetry.emit(TelemetryEvents.VECTOR_INDEX_CREATED, { index: result.targetIndex, entityName, hasVectorKey: !!result.vectorKey });
            }

            return result;
          },
          InvokeLLMBatched: batchedInvoke,

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
          beaming: (prompt: string, opts: { taskType?: 'chat' | 'thinking' | 'json' | 'vision'; signal?: AbortSignal; concurrency?: number } = {}) =>
            _beaming(prompt, resolvedOllamaEndpoints, resolvedModel, opts),

          UploadFile: async () => {},
          SendEmail: async () => {},
          GenerateImage: async () => {},
          ExtractDataFromUploadedFile: async () => {},
        }
    },
    // ── Rate limiter (configurable via client.setLimits / client.getLimits) ──
    get rateLimiter() { return rateLimiter; },
    setLimits: (limits: { maxCalls?: number; windowMs?: number } | null) => {
      rateLimitConfig = limits;
      rateLimiter = createRateLimiter('llm-api', limits ?? { unlimited: true });
      telemetry.emit(TelemetryEvents.LIMITS_UPDATED, { limits });
    },
    getLimits: () => (rateLimitConfig ? { ...rateLimitConfig } : null),
    // ── Expose improvement utilities on the client ──
    // #3: circuit breaker
    circuitBreaker,
    // #7: abort manager
    abortManager,
    // #4: structured logger (timed/info/warn/error)
    clientLogger,
    // #10: telemetry emitter/subscriber
    telemetry,
    // #6: tool registry
    toolRegistry,
    // #8: model router
    modelRouter,
    // #9: prompt router (openai-style enhancement of routed prompt)
    promptRouter,
    // #2: auth middleware
    authMiddleware,
    // ES entities proxy and endpoint — used by tests and app code via client
    esEntities,
    esEndpoint: getEsConfig().endpoint,

    /**
     * Retrieve the full messages array of a ChatSession by its ID.
     *
     * Usage:
     *   const messages = await client.getMessages('session-id-123');
     */
    async getMessages(sessionId: string): Promise<any[]> {
      if (!sessionId) return [];
      const session = await (esEntities as any).ChatSession.get(sessionId);
      return Array.isArray(session?.messages) ? session.messages : [];
    },

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
    streamResponse(
      task: 'chat' | 'vision' | 'code' | 'audio' | 'thinking',
      input: string,
      opts?: { trackProgress?: boolean; signal?: AbortSignal },
    ): {
      subscribe: (obs: {
        next: (chunk: string | AugmentedChunk) => void;
        error: (err: Error) => void;
        complete: (summary?: StreamSummary) => void;
      }) => void;
    } {
      const endpoint = (resolvedOllamaEndpoints[0] || resolvedOllamaEndpoints[1] || 'http://127.0.0.1:11434').replace(/\/$/, '');
      // Only resolve model via router for vision (where useModel is used directly).
      // Chat/code/audio delegate to invokeLLM which has its own model routing.
      const useModel = task === 'vision' ? modelRouter.resolve(task, input, resolvedModel) : resolvedModel;
      const trackProgress = opts?.trackProgress !== false;

      // Map task → system prompt for specialized behaviour
      const systemPrompt: Record<string, string> = {
        chat: 'You are a helpful assistant.',
        vision: 'Describe this image in detail.',
        code: 'You are an expert programming assistant. Write clean, well-documented code with explanations. Always include the language name in code blocks.',
        audio: 'You are an expert in audio engineering and acoustics. Provide clear, technical explanations about sound, audio processing, and related topics.',
        thinking: 'You are an expert reasoning assistant. Think through the problem step by step before answering.',
      };

      return {
        subscribe(obs) {
          const { signal } = opts || {};
          let tracker: ReturnType<typeof createProgressTracker> | null = null;

          async function runStream() {
            // Only fetch location when progress tracking is active
            const location = trackProgress
              ? await LocationService.getCurrentLocation().catch(() => undefined)
              : undefined;
            if (trackProgress) tracker = createProgressTracker(location);
            const sysMessage = systemPrompt[task] || systemPrompt.chat;

            if (task === 'vision') {
              const dataUrl = typeof input === 'string' && input.startsWith('data:')
                ? input
                : `data:image/jpeg;base64,${input}`;

              const body = {
                model: useModel,
                stream: true,
                messages: [{ role: 'user', content: [
                  { type: 'text', text: sysMessage },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ]}],
                temperature: 0,
              };

              const res = await rateLimiter.run(() =>
                trackedOllamaFetch(`${endpoint}/v1/chat/completions`, {
                  method: 'POST',
                  headers: authMiddleware.injectAuthHeaders({ 'Content-Type': 'application/json' }),
                  body: JSON.stringify(body),
                  signal,
                }, 'streamResponse-vision')
              );

              if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`Vision stream error: ${res.status} — ${errText}`);
              }

              await parseSSEStream(res, (delta: string) => {
                if (trackProgress && tracker) {
                  obs.next(tracker.next(delta));
                } else {
                  obs.next(delta);
                }
              });
            } else {
              // chat / code / audio — use invokeLLM with streaming
              await rateLimiter.run(async () => {
                await invokeLLM({
                  prompt: input,
                  system: sysMessage,
                  stream: true,
                  signal,
                  onToken: (delta: string) => {
                    if (trackProgress && tracker) {
                      obs.next(tracker.next(delta));
                    } else {
                      obs.next(delta);
                    }
                  },
                  ollamaEndpoints: resolvedOllamaEndpoints,
                  defaultModel: resolvedModel,
                });
              });
            }

            if (trackProgress && tracker) {
              obs.complete(tracker.summary());
            } else {
              obs.complete();
            }
          }

          runStream().catch((err) => obs.error(err instanceof Error ? err : new Error(String(err))));
        },
      };
    },
  };
  return client;
}






export const config = {
  serverUrl: getElasticsearchEndpoint(),
  appId: appId,
  functionsVersion: functionsVersion ?? undefined,
  entityEndpoint: [getElasticsearchEndpoint()],
  headers: {
    'Content-Type': 'application/json',
    'X-App-Id': String(appId),
  },
  capabilities: {},
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'why is the sky blue' },
  ],
  ollamaEndpoints: [getOllamaEndpoint(), 'http://127.0.0.1:11434'],
  model: 'qwen3:0.6b',
  defaultLocation: { lat: 0, lng: 0 },
  rateLimit: null as { maxCalls?: number; windowMs?: number } | null,
};





export const defaultClient = createClient(config);




// Simplified client wrapper — no-op proxy removed, entities assigned directly
export const createclientWithFallback = (_originalclient?: any) => {
  return { ...defaultClient, entities: esEntities };
};




// Full ES-backed entity management — no React hook needed at module level.
// createEsEntities returns a Proxy: client.entities.Persona.list(), .filter(), .get(), etc.
export const esConfig = getEsConfig();

const baseClient = _local
  ? { ...defaultClient, entities: esEntities }
  : createclientWithFallback({ ...defaultClient, entities: esEntities });

baseClient.entities = esEntities;

// export const client = createclientWithFallback(baseClient);

// Direct access to ES-backed entities and config helpers
export { esEntities, getEsConfig, saveEsConfig, createEsEntities, getIndexPrefix, setIndexPrefix };
