import axios from 'axios'; // Import axios directly

import { appParams, appId, token, functionsVersion, appBaseUrl, getAppParams, localStorage, LS_PREFIX } from "../apis/lib/app-params";

import { createEsEntities, getEsConfig, saveEsConfig, esEntities, getIndexPrefix, setIndexPrefix } from "../apis/lib/es-entities";
import { validateClientConfig } from "../apis/lib/config-schema";
import { clientLogger } from "../apis/lib/client-logger";
export { clientLogger };

import { thinkingStreamingFetch,ThinkingStreamingResult } from "../apis/modules/thinking/thinking-streaming";


import {thinkingEnabled  } from "../apis/modules/thinking/thinking-enabled";

import { thinkingLevels } from "../apis/modules/thinking/thinking-levels";
import { createCircuitBreaker } from "../apis/lib/circuit-breaker";
import { telemetry } from "../apis/lib/telemetry";
import { toolRegistry } from "../apis/lib/tool-registry";
import { modelRouter } from "../apis/lib/model-router";
import { promptRouter } from "../apis/lib/prompt-router";
import { createBatcher } from "../apis/lib/request-batcher";
import { createAuthMiddleware } from "../apis/lib/auth-middleware";
import { trackedOllamaFetch } from "../apis/lib/ollama-tracker";
import { abortManager } from "../apis/lib/abort-manager";
import { webSearch } from "../apis/modules/websearch/websearch-tools";
import { multiToolRun } from "../apis/modules/tools/multi-tool";
import { flightTracker } from "../apis/modules/tools/flight-tracker";
import { calculator } from "../apis/modules/tools/calculator";
import { vectorPipeline } from "./modules/vector/vector-pipeline";
import { safeExecute } from "./lib/safe-execute";
import { TelemetryEvents } from "./lib/telemetry-events";
import { endpointRegistry } from "./lib/endpoint-registry";
import { expandQuery as _expandQuery, solution as _solution, beaming as _beaming } from "./lib/task-orchestrator";
import { createRateLimiter, type RateLimiter } from "../apis/lib/rate-limiter";
import { createProgressTracker, type AugmentedChunk, type StreamSummary } from "../apis/lib/progress-tracker";
import { LocationService } from "../apis/lib/location";
import { hookTelemetry, patchLogger } from "../apis/lib/telemetryLogStore";

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
 * Returns the Ollama endpoint — delegates to endpointRegistry (single source of truth).
 * - browser + local  → '/proxy'  (Vite dev proxy)
 * - Node   + local   → 'http://127.0.0.1:11434'  (direct)
 * - remote           → ngrok public URL
 */
export const getOllamaEndpoint = () => endpointRegistry.ollama();

/**
 * Returns the Elasticsearch endpoint — delegates to endpointRegistry (single source of truth).
 * - browser + local  → '/db'  (Vite dev proxy)
 * - Node   + local   → 'http://127.0.0.1:9200'  (direct)
 * - remote           → ngrok public URL
 */
export const getElasticsearchEndpoint = () => endpointRegistry.elasticsearch();



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
  modelRouter?.resolveAsync?.('chat', resolvedModel)?.catch?.(() => {});

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
            const taskType = params?.tools ? 'tool_call' : params?.response_json_schema ? 'json' : 'chat';
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
              // Use caller's signal directly; fall back to a generous 120s timeout signal
              const effectiveSignal = signal ?? AbortSignal.timeout(120_000);

              try {
                const result = await clientLogger.timed('vector', async () => {
                  const res = await trackedOllamaFetch(`${endpoint}/v1/embeddings`, {
                    method: 'POST',
                    headers: authMiddleware.injectAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ model: useModel, input: text }),
                    signal: effectiveSignal,
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
     * Multi-entity vector search.
     *
     * Embeds the query text via Ollama, then runs a cosine-similarity
     * script_score search across multiple ES entity indices in a single
     * _msearch call. Returns ranked, de-duplicated hits annotated with
     * their source entity name.
     *
     * This is a read-only search — it does NOT create indices or reindex
     * documents (unlike vectorIndex/vectorPipeline). It queries whatever
     * `content_vector` (or `embedding`) dense_vector fields already exist
     * in each target index.
     *
     * @param params.query        Natural-language search text.
     * @param params.entities     Entity names to search across (e.g. ['Persona','Template']).
     *                            Omit/null → all known entities in the esConfig.
     * @param params.topK         Results per entity (default 5).
     * @param params.minScore     Minimum cosine similarity (0–2, default 1.0 ≈ cosine > 0).
     * @param params.signal       Optional AbortSignal.
     *
     * @returns { results: Array<{ entity, id, score, source }>, total, queryVectorDims }
     *
     * Usage:
     *   const { results } = await client.multiEntitySearch({
     *     query: "expert in python data analysis",
     *     entities: ['Persona', 'Template'],
     *     topK: 3,
     *   });
     */
    async multiEntitySearch(params: {
      query: string;
      entities?: string[];
      topK?: number;
      minScore?: number;
      signal?: AbortSignal;
    }): Promise<{
      results: Array<{ entity: string; id: string; score: number; source: any }>;
      total: number;
      queryVectorDims: number;
    }> {
      const { query, topK = 5, minScore = 1.0, signal } = params;
      if (!query?.trim()) return { results: [], total: 0, queryVectorDims: 0 };

      const esCfg = getEsConfig();
      const esEndpoint = esCfg.endpoint;

      // Resolve which entities (→ indices) to search
      const entityNames: string[] = params.entities?.length
        ? params.entities
        : Object.keys(esCfg.indices || {});

      // Build { entity → indexName } pairs, skipping any without a configured index
      const targets: Array<{ entity: string; index: string }> = [];
      for (const name of entityNames) {
        const idx = esCfg.indices?.[name];
        if (idx) targets.push({ entity: name, index: idx });
      }
      if (!targets.length) return { results: [], total: 0, queryVectorDims: 0 };

      // Embed the query via Ollama
      const embeddingModel = (config as any).embeddingModel || 'nomic-embed-text';
      const ollamaEndpoint = (resolvedOllamaEndpoints[0] || 'http://127.0.0.1:11434').replace(/\/$/, '');

      const controller = new AbortController();
      if (signal) signal.addEventListener('abort', () => controller.abort());
      const embedTimeout = setTimeout(() => controller.abort(), 60_000);
      let queryVector: number[] | null = null;
      try {
        const embedRes = await fetch(`${ollamaEndpoint}/v1/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: embeddingModel, input: query }),
          signal: controller.signal,
        });
        if (embedRes.ok) {
          const ej: any = await embedRes.json();
          queryVector = ej?.data?.[0]?.embedding || ej?.embedding || null;
        }
      } catch {
        queryVector = null;
      } finally {
        clearTimeout(embedTimeout);
      }

      // If embedding failed, fall back to a keyword multi_match search across all targets
      if (!queryVector || !queryVector.length) {
        const allResults: Array<{ entity: string; id: string; score: number; source: any }> = [];
        for (const { entity, index } of targets) {
          try {
            const res = await fetch(`${esEndpoint}/${index}/_search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                size: topK,
                query: { multi_match: { query, fields: ['*'], type: 'best_fields', operator: 'or' } },
              }),
              signal,
            });
            if (!res.ok) continue;
            const data: any = await res.json();
            for (const hit of data.hits?.hits || []) {
              allResults.push({ entity, id: hit._id, score: hit._score || 0, source: hit._source });
            }
          } catch {}
        }
        allResults.sort((a, b) => b.score - a.score);
        return { results: allResults, total: allResults.length, queryVectorDims: 0 };
      }

      // Build an ES _msearch body — one sub-search per target index.
      // Each uses script_score with cosineSimilarity against the `content_vector`
      // field, falling back to `embedding` if the index uses that name.
      const msearchLines: string[] = [];
      for (const { index } of targets) {
        // header line
        msearchLines.push(JSON.stringify({ index }));
        // body line — try content_vector first; if the index doesn't have it,
        // the script will error and we catch it per-hit below.
        msearchLines.push(JSON.stringify({
          size: topK,
          query: {
            bool: {
              should: [
                { script_score: {
                  query: { match_all: {} },
                  script: {
                    source: 'double s = cosineSimilarity(params.query_vector, "content_vector"); return s + 1.0;',
                    params: { query_vector: queryVector },
                  },
                }},
                { script_score: {
                  query: { match_all: {} },
                  script: {
                    source: 'double s = cosineSimilarity(params.query_vector, "embedding"); return s + 1.0;',
                    params: { query_vector: queryVector },
                  },
                }},
              ],
              minimum_should_match: 1,
            },
          },
          min_score: minScore,
        }));
      }

      let msearchData: any = null;
      try {
        const msRes = await fetch(`${esEndpoint}/_msearch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-ndjson' },
          body: msearchLines.join('\n') + '\n',
          signal,
        });
        if (msRes.ok) msearchData = await msRes.json();
      } catch {
        msearchData = null;
      }

      const allResults: Array<{ entity: string; id: string; score: number; source: any }> = [];
      if (msearchData?.responses) {
        for (let i = 0; i < msearchData.responses.length; i++) {
          const resp = msearchData.responses[i];
          const { entity } = targets[i];
          if (resp?.error) continue; // index missing the vector field → skip
          for (const hit of resp?.hits?.hits || []) {
            allResults.push({ entity, id: hit._id, score: hit._score || 0, source: hit._source });
          }
        }
      }

      // De-duplicate by entity+id, sort by score descending
      const seen = new Set<string>();
      const deduped = allResults.filter(r => {
        const key = `${r.entity}::${r.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a, b) => b.score - a.score);

      return { results: deduped, total: deduped.length, queryVectorDims: queryVector.length };
    },

    /**
     * Probe the Ollama host to detect compute backend (CPU/GPU) and available
     * resources (RAM, GPU layers, loaded models, VRAM usage).
     *
     * Queries three Ollama endpoints in parallel:
     *   - /api/ps        → running models + VRAM/RAM sizes
     *   - /api/tags      → installed models with quantization details
     *   - /api/show      → per-model capabilities (detect GPU offload via flags)
     *
     * Returns a normalized report. All network errors are caught — fields are
     * null/empty when the endpoint is unreachable so callers can rely on the
     * shape regardless.
     *
     * Usage:
     *   const info = await client.probe();
     *   console.log(info.backend);        // 'gpu' | 'cpu' | 'unknown'
     *   console.log(info.totalVramMb);    // 8192
     *   console.log(info.loadedModels);   // [{ name, sizeVramMb, sizeRamMb }]
     */
    async probe(): Promise<{
      backend: 'gpu' | 'cpu' | 'unknown';
      reachable: boolean;
      endpoint: string;
      totalVramMb: number | null;
      totalRamMb: number | null;
      loadedModels: Array<{ name: string; sizeVramMb: number; sizeRamMb: number; expiresAt: string | null }>;
      installedModels: Array<{ name: string; quantization: string | null; paramCount: number | null; sizeMb: number }>;
      probedAt: string;
    }> {
      const endpoint = (resolvedOllamaEndpoints[0] || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const result = {
        backend: 'unknown' as 'gpu' | 'cpu' | 'unknown',
        reachable: false,
        endpoint,
        totalVramMb: null as number | null,
        totalRamMb: null as number | null,
        loadedModels: [] as Array<{ name: string; sizeVramMb: number; sizeRamMb: number; expiresAt: string | null }>,
        installedModels: [] as Array<{ name: string; quantization: string | null; paramCount: number | null; sizeMb: number }>,
        probedAt: new Date().toISOString(),
      };

      const fetchJson = async (path: string, timeoutMs = 5000) => {
        const res = await fetch(`${endpoint}${path}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      };

      try {
        // Parallel: running models (/api/ps) + installed models (/api/tags)
        const [psData, tagsData] = await Promise.all([
          fetchJson('/api/ps').catch(() => null),
          fetchJson('/api/tags').catch(() => null),
        ]);

        result.reachable = !!(psData || tagsData);

        // ── Running models (VRAM = GPU in use) ──
        if (psData?.models) {
          let vramSum = 0;
          let ramSum = 0;
          result.loadedModels = psData.models.map((m: any) => {
            const sizeVram = (m.size_vram ?? 0) / 1024 / 1024; // bytes → MB
            const sizeRam = ((m.size ?? 0) - (m.size_vram ?? 0)) / 1024 / 1024;
            vramSum += sizeVram;
            ramSum += sizeRam;
            return {
              name: m.name || m.model || 'unknown',
              sizeVramMb: Math.round(sizeVram),
              sizeRamMb: Math.round(sizeRam),
              expiresAt: m.expires_at ?? null,
            };
          });
          if (vramSum > 0) {
            result.totalVramMb = Math.round(vramSum);
            result.backend = 'gpu';
          } else if (ramSum > 0) {
            result.totalRamMb = Math.round(ramSum);
            result.backend = 'cpu';
          }
        }

        // ── Installed models (quantization hints at GPU intent) ──
        if (tagsData?.models) {
          result.installedModels = tagsData.models.map((m: any) => ({
            name: m.name || m.model || 'unknown',
            quantization: m.details?.quantization_level ?? m.quantization_level ?? null,
            paramCount: m.details?.parameter_size
              ? parseFloat(m.details.parameter_size) * (m.details.parameter_size.includes('B') ? 1e9 : 1e6)
              : null,
            sizeMb: Math.round((m.size ?? 0) / 1024 / 1024),
          }));
        }

        // ── If still unknown, probe a model's /api/show for GPU flags ──
        if (result.backend === 'unknown' && result.installedModels.length > 0) {
          try {
            const showData = await fetchJson('/api/show', 5000).catch(() => null);
            // Not all versions support a bare /api/show; skip if it fails.
            if (showData?.model_info?.['general.gpu_layers'] > 0) {
              result.backend = 'gpu';
            }
          } catch {}
        }
      } catch {
        // endpoint unreachable — return the default (unknown) result
      }

      return result;
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
  ollamaEndpoints: endpointRegistry.ollamaAll(),
  model: (typeof process !== 'undefined' && process.env.OLLAMA_MODEL) || 'qwen3:0.6b',
  defaultLocation: { lat: 0, lng: 0 },
  rateLimit: null as { maxCalls?: number; windowMs?: number } | null,
  storageKey: 'local_ai_config',
  temperature: 0.7,
  maxTokens: 2048,
  defaultVisionModel: 'llava',
};


let _clientLibrary = null;
export async function getClientLibrary(){
  if (_clientLibrary) return _clientLibrary;
  try {
    _clientLibrary = await import('./ClientLibrary');
    return _clientLibrary;
  } catch (e) {
    console.error(`Cannot import ./ClientLibrary — run in browser/Vite context or configure path aliases. (${e?.message || e})`);
  }
}


export const defaultClient = createClient(config);




// Simplified client wrapper — no-op proxy removed, entities assigned directly
export const createclientWithFallback = (_originalclient?: any) => {
  return { ...defaultClient, entities: esEntities };
};




// Full ES-backed entity management — no React hook needed at module level.
// createEsEntities returns a Proxy: client.entities.Persona.list(), .filter(), .get(), etc.
export const esConfig = getEsConfig();

export const baseClient = _local
  ? { ...defaultClient, entities: esEntities }
  : createclientWithFallback({ ...defaultClient, entities: esEntities });

baseClient.entities = esEntities;

export const client = createclientWithFallback(baseClient);

// Wire telemetry + client logger into the global log store so UI components
// (TelemetryInfoDialog) can observe all events and log lines in real time.
patchLogger(clientLogger);
hookTelemetry(telemetry);

// Direct access to ES-backed entities and config helpers
export { esEntities, getEsConfig, saveEsConfig, createEsEntities, getIndexPrefix, setIndexPrefix };

// ─── OpenAI-compatible chat methods (frontend-facing) ────────────────────────
// These methods use client.config (localStorage-backed) for defaults;
// per-call options still override for signal/endpoint/model when needed.

/** Returns stored config from localStorage (key: config.storageKey) */
export function getStoredConfig() {
  try {
    const raw = localStorage.getItem(config.storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Persists config to localStorage (key: config.storageKey) */
export function setStoredConfig(cfg: any) {
  localStorage.setItem(config.storageKey, JSON.stringify(cfg));
}

/** Returns the active endpoint from localStorage config, falling back to client.config */
export function getActiveEndpoint() {
  const cfg = getStoredConfig();
  const ep = cfg?.endpoint
    || (client as any)?.config?.ollamaEndpoints?.[0]
    || (config as any)?.ollamaEndpoints?.[0]
    || endpointRegistry.ollama();
  return (ep || '').replace(/\/$/, '');
}

/** Returns the active model from localStorage config, falling back to client.config */
export function getActiveModel() {
  const cfg = getStoredConfig();
  return cfg?.model
    || (client as any)?.getConfig?.()?.model
    || localStorage.getItem(`${LS_PREFIX}default_model`)
    || (config as any)?.model
    || 'gpt-4o-mini';
}

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ollama',
    'ngrok-skip-browser-warning': 'true',
  };
}

/**
 * Core OpenAI-compatible chat completion via Ollama.
 * Defaults from client.config; options override per-call.
 */
export async function chatCompletion(messages: Array<{ role: string; content: string }>, options: any = {}) {
  const endpoint = options.endpoint || getActiveEndpoint();
  const model = options.model || getActiveModel();
  const temperature = options.temperature ?? config.temperature ?? 0.7;
  const max_tokens = options.max_tokens || config.maxTokens || 2048;

  telemetry.emit(TelemetryEvents.REQUEST_START, { endpoint, model, stream: false, messageCount: messages.length });
  const start = Date.now();

  const res = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(),
    signal: options.signal,
    body: JSON.stringify({ model, messages, temperature, max_tokens, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    telemetry.emit(TelemetryEvents.ERROR, { endpoint, model, status: res.status, error: text, durationMs: Date.now() - start });
    throw new Error(`Ollama ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  telemetry.emit(TelemetryEvents.REQUEST_END, { endpoint, model, stream: false, durationMs: Date.now() - start, usage: data.usage ?? null });
  clientLogger.log('info', 'chatCompletion', { model, endpoint, durationMs: Date.now() - start }, Date.now() - start);
  return content;
}

/**
 * Streaming chat completion — calls onChunk(delta, full, usageData) for each token.
 */
export async function chatCompletionStream(
  messages: Array<{ role: string; content: string }>,
  onChunk: (delta: string, full: string, usageData: any) => void,
  options: any = {},
) {
  const endpoint = options.endpoint || getActiveEndpoint();
  const model = options.model || getActiveModel();
  const temperature = options.temperature ?? config.temperature ?? 0.7;
  const max_tokens = options.max_tokens || config.maxTokens || 2048;

  telemetry.emit(TelemetryEvents.REQUEST_START, { endpoint, model, stream: true, messageCount: messages.length });
  const start = Date.now();

  const res = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(),
    signal: options.signal,
    body: JSON.stringify({ model, messages, temperature, max_tokens, stream: true }),
  });

  if (!res.ok) {
    telemetry.emit(TelemetryEvents.ERROR, { endpoint, model, stream: true, status: res.status, durationMs: Date.now() - start });
    throw new Error(`Ollama stream ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter((l) => l.startsWith('data:'));
    for (const line of lines) {
      const json = line.replace(/^data:\s*/, '');
      if (json === '[DONE]') continue;
      try {
        const parsed = JSON.parse(json);
        const delta = parsed.choices?.[0]?.delta?.content || '';
        if (delta) {
          full += delta;
          onChunk(delta, full, parsed.usage || null);
        }
      } catch {}
    }
  }
  telemetry.emit(TelemetryEvents.REQUEST_END, { endpoint, model, stream: true, durationMs: Date.now() - start, chars: full.length });
  clientLogger.log('info', 'chatCompletionStream', { model, endpoint, durationMs: Date.now() - start }, Date.now() - start);
  return full;
}

/** List available models from Ollama. */
export async function listModels(endpoint?: string) {
  const base = (endpoint || getActiveEndpoint()).replace(/\/$/, '');
  const res = await fetch(`${base}/v1/models`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: any = await res.json();
  return (data.data || []).map((m: any) => m.id);
}

/** Fetch model details from /api/show. */
export async function fetchModelDetails(endpoint?: string, modelName?: string) {
  const base = (endpoint || getActiveEndpoint()).replace(/\/$/, '');
  const res = await fetch(`${base}/api/show`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ model: modelName }),
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  const capabilities = data.capabilities || [];
  return {
    capabilities,
    family: data.details?.family || null,
    parameter_size: data.details?.parameter_size || null,
  };
}

/** Send a single prompt with optional system prompt, get a string back. */
export async function ask(prompt: string, systemPrompt = '', options: any = {}) {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  return chatCompletion(messages, options);
}

// ─── Persona Auto-Suggest ────────────────────────────────────────────────────
// Moved here from PersonaAutoSuggest.jsx so the matching logic (query
// optimization, keyword pre-filter, vector search, threshold, dedup) lives in
// the API layer and the component is purely presentational.

const PERSONA_ROTATE_THRESHOLD = 1.5; // cosine similarity + 1.0; >1.5 ≈ cosine > 0.5

const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'or',
  'in', 'on', 'at', 'for', 'it', 'this', 'that', 'i', 'you', 'we', 'they', 'he',
  'she', 'my', 'your', 'our', 'please', 'can', 'could', 'would', 'should', 'do',
  'does', 'with', 'as', 'by', 'from', 'about', 'into', 'just', 'like', 'really',
  'very', 'so', 'but', 'not', 'me', 'him', 'her', 'them', 'its', 'if', 'then',
  'than', 'also', 'too', 'up', 'out', 'over', 'again',
]);

const DOMAIN_KEYWORDS = [
  'sql', 'debug', 'legal', 'contract', 'translate', 'python', 'javascript', 'react',
  'marketing', 'finance', 'medical', 'write', 'summarize', 'explain', 'code',
  'design', 'business', 'science', 'math', 'history', 'essay', 'email', 'blog',
  'seo', 'data', 'api', 'cloud', 'security', 'recipe', 'travel', 'fitness',
  'study', 'research', 'invest', 'tax', 'therapy', 'music', 'art', 'game',
  'devops', 'frontend', 'backend',
];

/** Strip filler words, dedupe tokens, and truncate — tight signal-dense query for the embedder. */
export function optimizePersonaQuery(text: string): string {
  const trimmed = text.trim().slice(0, 1000);
  const tokens = trimmed.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !FILLER_WORDS.has(w));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out.slice(0, 60).join(' ');
}

/** Sentinel pre-filter — returns the set of domain keywords found in the text. */
export function extractPersonaKeywords(text: string): Set<string> {
  const lower = text.toLowerCase();
  return new Set(DOMAIN_KEYWORDS.filter((k) => lower.includes(k)));
}

/** Cosine similarity between two equal-length numeric vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Run persona auto-suggest for a chat message.
 *
 * Encapsulates query optimization, the sentinel keyword pre-filter (draft mode),
 * vector embedding + ES cosine-similarity search, score thresholding, and
 * de-duplication against the currently active persona.
 *
 * @param text                 The user's message / draft.
 * @param currentPersonaName   Name of the active persona (to skip re-applying the same one).
 * @param options.perMessage   When true, optimize the query and skip the keyword pre-filter.
 * @param options.topK         Number of candidates to retrieve (default 1).
 * @param options.threshold    Minimum score to accept a match (default 1.5).
 * @param options.signal       Optional AbortSignal.
 *
 * @returns `{ shouldRotate, persona, matchName }` when a new persona should be
 *          applied, or `{ shouldRotate: false }` when no rotation is needed.
 */
export async function suggestPersona(
  text: string,
  currentPersonaName: string,
  options: { perMessage?: boolean; topK?: number; threshold?: number; signal?: AbortSignal } = {},
): Promise<{ shouldRotate: boolean; persona?: any; matchName?: string }> {
  const { perMessage = false, topK = 1, threshold = PERSONA_ROTATE_THRESHOLD, signal } = options;

  // Build the query — optimized (filler-stripped) in per-message mode, raw in draft mode
  const query = perMessage ? optimizePersonaQuery(text) : text;
  if (!query || query.trim().length < 5) return { shouldRotate: false };

  // Draft-mode sentinel: skip the embedder entirely when no domain keywords are present
  if (!perMessage) {
    const keywords = extractPersonaKeywords(query);
    if (keywords.size === 0) return { shouldRotate: false };
  }

  // Timeout guard — never hang the caller
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000));

  const run = (async (): Promise<any[] | null> => {
    try {
      // Step 1: Extract a concise category via LLM
      const categoryResult: any = await defaultClient.integrations.Core.InvokeLLM({
        prompt: `Extract a concise category label (1-3 words) that best describes the topic of this message. Respond with ONLY the category, nothing else.\n\nMessage: "${query.slice(0, 500)}"`,
        response_json_schema: {
          type: 'object',
          properties: { category: { type: 'string' } },
          required: ['category'],
        },
      });
      const category = (categoryResult?.category || query.slice(0, 100)).trim();

      // Step 2: Embed the category + snippet
      const embedding = await defaultClient.integrations.Core.vector(`${category} ${query.slice(0, 200)}`, signal);
      if (!embedding || !embedding.length) return null;

      // Step 3: Fetch PersonaVector candidates via esEntities (the ES-backed
      // entity proxy) and compute cosine similarity client-side. This keeps the
      // data source consistent with the rest of the app — no raw ES fetches.
      const all = await (esEntities as any).PersonaVector.list('-created_date', 500);
      if (!all || all.length === 0) return null;

      const results: Array<{ id: string; score: number; [k: string]: any }> = [];
      for (const doc of all) {
        const vec = (doc as any).embedding;
        if (!Array.isArray(vec) || vec.length !== embedding.length) continue;
        const score = cosineSimilarity(embedding, vec) + 1.0;
        results.push({ id: doc.id, score, ...doc });
      }
      return results.length ? results.sort((a, b) => b.score - a.score).slice(0, topK) : null;
    } catch {
      return null;
    }
  })();

  const results = await Promise.race([run, timeout]);
  if (!results || results.length === 0) return { shouldRotate: false };

  // Rank by score (descending) and pick the best match
  const ranked = results
    .filter((r: any) => (r.score || 0) > threshold)
    .sort((a: any, b: any) => (b.score || 0) - (a.score || 0));

  if (ranked.length === 0) return { shouldRotate: false };

  const match = ranked[0];
  const matchName = match.name || match.role || 'Expert';
  // Don't re-apply the persona that's already active
  if (matchName === currentPersonaName) return { shouldRotate: false };

  return { shouldRotate: true, persona: match, matchName };
}

// ─── Persona Matcher ─────────────────────────────────────────────────────────
// Moved from PersonaAutoSuggest.jsx — persona cache and matching pipeline
// live here in the API layer. Worker-agnostic: runs in browser, backend
// scripts, and Jest tests.

let _personaCache: any[] = [];
let _personaCacheTime = 0;

async function getPersonaCandidates(): Promise<any[]> {
  const now = Date.now();
  if (_personaCache.length > 0 && now - _personaCacheTime < 60_000) return _personaCache;
  try {
    const list = await (esEntities as any).PersonaVector.list('-created_date', 500);
    _personaCache = Array.isArray(list) ? list : [];
    _personaCacheTime = now;
  } catch {
    _personaCache = [];
  }
  return _personaCache;
}

export function hasPersonaDomainKeyword(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return DOMAIN_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Match a chat message against available personas.
 *
 * Persona candidates are sourced from esEntities.PersonaVector (same source
 * as suggestPersona above). Embeds the query via Ollama and ranks candidates
 * by cosine similarity. Works in browser, backend, and test environments.
 *
 * @returns `{ shouldRotate, persona?, matchName? }`
 */
export async function matchPersona(
  text: string,
  currentPersonaName: string,
  threshold = 1.5,
): Promise<{ shouldRotate: boolean; persona?: any; matchName?: string }> {
  if (!text || text.trim().length < 5) return { shouldRotate: false };

  telemetry.emit(TelemetryEvents.PERSONA_AUTOSUGGEST_REQUEST, { inputText: text.slice(0, 200), inputLength: text.length });
  const start = Date.now();

  const personas = await getPersonaCandidates();
  if (!personas.length) return { shouldRotate: false };

  const query = optimizePersonaQuery(text);
  if (!query || query.trim().length < 5) return { shouldRotate: false };

  const keywords = extractPersonaKeywords(query);
  telemetry.emit(TelemetryEvents.PERSONA_AUTOSUGGEST_KEYWORDS, { keywords: Array.from(keywords).join(', '), fallbackUsed: keywords.size === 0 });

  const embedding = await defaultClient.integrations.Core.vector(query);
  if (!embedding || !embedding.length) return { shouldRotate: false };

  telemetry.emit(TelemetryEvents.PERSONA_AUTOSUGGEST_SEARCH, {
    searchUrl: `${getActiveEndpoint()}/v1/embeddings`,
    index: 'personavector',
    topK: 1,
    queryVectorDims: embedding.length,
    embeddingModel: 'nomic-embed-text',
  });

  const results: Array<{ score: number; [k: string]: any }> = [];
  for (const p of personas) {
    const vec = (p as any).embedding;
    if (!Array.isArray(vec) || vec.length !== embedding.length) continue;
    const score = cosineSimilarity(embedding, vec) + 1.0;
    results.push({ score, ...p });
  }
  results.sort((a, b) => (b.score || 0) - (a.score || 0));

  const match = results.find((r) => (r.score || 0) > threshold);
  const durationMs = Date.now() - start;
  if (!match) {
    clientLogger.log('info', 'persona:match-no-result', { topScore: results[0]?.score ?? 0, durationMs }, durationMs);
    return { shouldRotate: false };
  }

  const matchName = match.name || match.role || 'Expert';
  if (matchName === currentPersonaName) return { shouldRotate: false };

  clientLogger.log('info', 'persona:match-found', { matchName, score: match.score, durationMs }, durationMs);
  return { shouldRotate: true, persona: match, matchName };
}

export function terminatePersonaMatcher() {
  _personaCache = [];
  _personaCacheTime = 0;
}

/** Refine/improve a user prompt using the LLM. */
export async function refinePrompt(userPrompt: string, options: any = {}) {
  const system = `You are a prompt engineering expert. Rewrite the user's prompt to be clearer, more specific, and more likely to produce a great AI response. Output ONLY the improved prompt, no explanation.`;
  return ask(userPrompt, system, options);
}

/** Generate a short title for a conversation from the first message. */
export async function generateTitle(firstMessage: string, options: any = {}) {
  const system = `Generate a short, descriptive title (max 6 words) for a conversation that starts with the following message. Output ONLY the title, no punctuation or quotes.`;
  return ask(firstMessage, system, { ...options, temperature: 0.5 });
}

/** Extract memory/key facts from a conversation. */
export async function extractMemory(conversationText: string, previousMemory = '', options: any = {}) {
  const system = `Extract 2-3 concise key facts about the user from this conversation to remember for future sessions. Output only the memory facts, no explanation.`;
  const prompt = `${previousMemory ? `Previous memory: ${previousMemory}\n\n` : ''}Conversation:\n${conversationText}`;
  return ask(prompt, system, { ...options, temperature: 0.3 });
}

/**
 * Analyze an image using an Ollama vision model (OpenAI-compatible).
 * imageBase64OrUrl: base64 string (without data: prefix) or full data URL
 */
export async function analyzeImage(imageBase64OrUrl: string, prompt = 'Describe this image in detail.', options: any = {}) {
  const endpoint = options.endpoint || getActiveEndpoint();
  const model = options.model || config.defaultVisionModel || 'llava';

  const imageUrl = imageBase64OrUrl.startsWith('data:')
    ? imageBase64OrUrl
    : `data:image/jpeg;base64,${imageBase64OrUrl}`;

  const messages: any[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  const res = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(),
    signal: options.signal,
    body: JSON.stringify({ model, messages, stream: false, temperature: options.temperature ?? 0.3 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vision ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Apply a quick action transformation to a message.
 * action: 'summarize' | 'translate' | 'fix_code' | 'explain_simple' | 'improve_writing'
 */
export async function applyQuickAction(action: string, content: string, options: any = {}) {
  const prompts: Record<string, string> = {
    summarize: 'Summarize the following in 3-5 bullet points:',
    translate: 'Translate the following to English (or if already English, to Spanish):',
    fix_code: 'Fix any bugs in the following code and explain the changes:',
    explain_simple: "Explain the following like I'm 5 years old:",
    improve_writing: 'Improve the writing quality and clarity of the following:',
  };
  const system = prompts[action] || 'Process the following:';
  return ask(content, system, options);
}
