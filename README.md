# Ollama-Spaceship

![Ollama-Spaceship](https://github.com/santenova/ollama-spaceship/blob/main/images/ollama-spaceship.png)

----

## why


- **🚀  Data Sovereignty**:
    Complete data privacy with local deployment - no cloud providers, no third parties reading prompts

- **📁  GDPR Compliance ✅**:
    Perfect for companies bound by GDPR, industry regulations, or government restrictions on AI usage

- **⚡  Zero Operational AI Costs**:
    No token costs, no API fees - use open-source models like Ollama, reducing AI spending by 90%

- **⚡  Geopolitical Independence**:
    No dependency on US tech giants or foreign governments - critical advantage in current market

- **⚡  Hybrid Architecture**:
    Flexibility to mix local models with cloud APIs where appropriate - best of both worlds

- **⚡  Rapid Deployment**:
    Clone-ready infrastructure allows enterprises to launch their AI marketplace in weeks, not months


    
    
```

## Development entry points are

apis/client.ts ->  (low-level singleton)
apis/ClientLibrary.ts -> (high-level class wrapper).
```
---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [client.ts — Core Client](#2-clientts--core-client)
3. [ClientLibrary.ts — High-Level Wrapper](#3-clientlibraryts--high-level-wrapper)
4. [lib/es-entities.ts — Elasticsearch Entity Store](#4-libes-entitiests--elasticsearch-entity-store)
5. [lib/circuit-breaker.ts](#5-libcircuit-breakerts)
6. [lib/rate-limiter.ts](#6-librate-limiterts)
7. [lib/abort-manager.ts](#7-libabort-managerts)
8. [lib/auth-middleware.ts](#8-libauth-middlewarets)
9. [lib/client-logger.ts](#9-libclient-loggerts)
10. [lib/telemetry.ts](#10-libtelemetryts)
11. [lib/tool-registry.ts](#11-libtool-registryts)
12. [lib/model-router.ts](#12-libmodel-routerts)
13. [lib/prompt-router.ts](#13-libprompt-routerts)
14. [lib/endpoint-registry.ts](#14-libendpoint-registryts)
15. [lib/request-batcher.ts](#15-librequest-batcherts)
16. [lib/safe-execute.ts](#16-libsafe-executets)
17. [lib/progress-tracker.ts](#17-libprogress-trackerts)
18. [lib/task-orchestrator.ts](#18-libtask-orchestratorts)
19. [modules/vector/vector-pipeline.ts](#19-modulesvectorvector-pipelinets)
20. [modules/websearch/websearch-tools.ts](#20-moduleswebsearchwebsearch-toolsts)
21. [modules/thinking/](#21-modulesthinking)
22. [modules/tools/](#22-modulestools)
23. [lib/telemetry-events.ts — Telemetry Event Catalogue](#23-libtelemetry-eventsts--telemetry-event-catalogue)
24. [lib/cost-estimator.ts — Prompt Cost Estimator](#24-libcost-estimatorts--prompt-cost-estimator)
25. [lib/conversation-memory.ts — Conversation Memory (RAG)](#25-libconversation-memoryts--conversation-memory-rag)
26. [lib/ab-testing.ts — Prompt A/B Testing](#26-libab-testingts--prompt-ab-testing)
27. [lib/scheduled-jobs.ts — Scheduled LLM Jobs](#27-libscheduled-jobsts--scheduled-llm-jobs)
28. [lib/ground-check.ts — Grounding Checker](#28-libground-checkts--grounding-checker)
29. [lib/endpoint-failover.ts — Multi-Endpoint Failover](#29-libendpoint-failoverts--multi-endpoint-failover)
30. [lib/openai-fetch.ts — OpenAI-Style Fetch Helpers](#30-libopenai-fetchts--openai-style-fetch-helpers)
31. [lib/ollama-tracker.ts — Ollama Request/Response Tracker](#31-libollama-trackerts--ollama-requestresponse-tracker)
32. [lib/location.ts — Location Service](#32-liblocationts--location-service)
33. [lib/app-params.ts — Environment & App-Parameter Resolver](#33-libapp-paramts--environment--app-parameter-resolver)
34. [lib/config-schema.ts — Zod Config Validation](#34-libconfig-schemats--zod-config-validation)
37. [lib/resurces.ts — Model Capability Discovery](#37-libresurcests--model-capability-discovery)
38. [lib/triple-validation.ts — Triple Validation Benchmark](#38-libtriple-validationts--triple-validation-benchmark)
39. [lib/entities.ts + lib/functions.ts — Axios Entity & Function Modules (legacy)](#39-libentitiests--libfunctionsts--axios-entity--function-modules-legacy)
40. [modules/websearch/gpt-oss-browser-tools.ts — Browser Tool Agent](#40-moduleswebsearchgpt-oss-browser-toolts--browser-tool-agent)

---

## 1. Architecture Overview

```
ClientLibrary.ts          ← High-level class API (recommended for app code)
    │
    └─► client.ts         ← Low-level singleton; wires all lib/* modules together
            │
            ├─ lib/es-entities.ts         ES-backed entity CRUD (Proxy)
            ├─ lib/circuit-breaker.ts     Fault tolerance
            ├─ lib/rate-limiter.ts        Token-bucket throttle
            ├─ lib/abort-manager.ts       Cancellation registry
            ├─ lib/auth-middleware.ts     Bearer token injection
            ├─ lib/client-logger.ts       Structured timed logger
            ├─ lib/telemetry.ts           Event emitter / subscriber
            ├─ lib/tool-registry.ts       Dynamic tool/plugin map
            ├─ lib/model-router.ts        Capability-aware model selector
            ├─ lib/prompt-router.ts       LLM-based prompt enhancer
            ├─ lib/endpoint-registry.ts   Ollama + ES URL resolver
            ├─ lib/app-params.ts         Env / localStorage / URL param resolver
            ├─ lib/config-schema.ts      Zod config validation (fail-fast)
            ├─ lib/request-batcher.ts     Micro-batch parallel calls
            ├─ lib/safe-execute.ts        Unified error/telemetry decorator
            ├─ lib/progress-tracker.ts    Stream token metadata
            ├─ lib/task-orchestrator.ts   expandQuery / solution / beaming
            ├─ modules/vector/            Full vectorization pipeline
            ├─ modules/websearch/         Web search via Ollama
            ├─ modules/thinking/          Chain-of-thought helpers
            └─ modules/tools/             flight tracker, calculator, multi-tool
```

Endpoint resolution order (for both Ollama and Elasticsearch):

1. Runtime `client.updateConfig()` / `endpointRegistry.update()`
2. `localStorage` (`ollama_endpoints`, `prompthub_server_url`)
3. Auto-detect from `window.location.hostname` (local vs. remote)

---

## 2. `client.ts` — Core Client

**File:** `src/apis/client.ts`

The singleton `defaultClient` / `client` / `baseClient` created by `createClient(config)`.  
All library modules are wired here; app code should prefer **ClientLibrary** or the exported singletons.

### Factory

```ts
import { createClient } from '@/apis/client';

const myClient = createClient({
  serverUrl: 'https://es.example.com',   // Elasticsearch endpoint
  appId: 'my-app',
  model: 'qwen3:0.6b',                   // default Ollama model
  ollamaEndpoints: ['http://127.0.0.1:11434'],
  headers: { 'X-App-Id': 'my-app' },
  rateLimit: { maxCalls: 20, windowMs: 1000 }, // null = unlimited
});
```

### `invokeLLM(opts)` — standalone export

Calls Ollama's OpenAI-compatible `/v1/chat/completions`.

| Option | Type | Description |
|---|---|---|
| `prompt` | `string` | User prompt (mutually exclusive with `messages`) |
| `messages` | `Message[]` | OpenAI-style messages array |
| `system` | `string` | System prompt prepended to the conversation |
| `model` | `string` | Ollama model override |
| `temperature` | `number` | Sampling temperature |
| `response_json_schema` | `object` | JSON schema → forces structured JSON output |
| `stream` | `boolean` | Enable SSE streaming |
| `onToken` | `(delta: string) => void` | Streaming callback |
| `tools` | `object[]` | OpenAI tool schemas |
| `returnRaw` | `boolean` | Return full API response object |
| `think` | `boolean` | Enable chain-of-thought (Ollama extension) |
| `add_context_from_internet` | `boolean` | Prepend web search context |
| `signal` | `AbortSignal` | Cancellation |
| `ollamaEndpoints` | `string[]` | Endpoints to use |
| `defaultModel` | `string` | Fallback model |

### Client Instance API

#### Config
```ts
client.getConfig()                        // returns live resolved config object
client.updateConfig({ model: 'llama3' }) // hot-update without recreating client
client.getEsConfig()                      // ES endpoint + index map
client.saveEsConfig(cfg)                  // persist ES config to localStorage
```

#### Rate Limiting
```ts
client.setLimits({ maxCalls: 10, windowMs: 1000 })
client.setLimits(null)   // disable limiting
client.getLimits()       // → { maxCalls, windowMs } | null
```

#### `integrations.Core`

| Method | Description |
|---|---|
| `InvokeLLM(params)` | Route-aware LLM call (circuit breaker + rate limiter) |
| `InvokeLLMBatched(params)` | Batched variant — groups calls within 20ms window |
| `beaming(prompt, opts)` | Fan-out to ALL models in parallel, returns per-model results |
| `expandQuery(query, signal)` | LLM expands a query into 5-8 related terms |
| `solution(prompt, signal)` | 2-persona debate → solutions manifest |
| `vector(text, signal)` | Generate embedding vector for text |
| `vectorIndex(params)` | Full vector pipeline (keywords → ES reindex → embeddings) |
| `vision.encode(source)` | Encode image to data URL |
| `vision.send(...)` | Send vision request to Ollama |
| `websearch(params)` | Web search via Ollama |
| `toolbox(params)` | Multi-tool execution (flight, calculator, etc.) |
| `thinking(prompt)` | Streaming chain-of-thought |
| `thinkingEnabled(prompt, signal)` | Check if model supports thinking |
| `thinkingLevels(prompt, signal)` | Get thinking depth levels |

#### Infrastructure accessors
```ts
client.circuitBreaker    // see §5
client.abortManager      // see §7
client.clientLogger      // see §9
client.telemetry         // see §10
client.toolRegistry      // see §11
client.modelRouter       // see §12
client.promptRouter      // see §13
client.authMiddleware    // see §8
client.esEntities        // see §4
client.esEndpoint        // current ES URL string
client.rateLimiter       // current RateLimiter instance
```

#### `streamResponse(task, input, opts)`

Observable-style SSE streaming for `'chat' | 'vision' | 'code' | 'audio' | 'thinking'`.

```ts
client.streamResponse('chat', 'Tell me a joke').subscribe({
  next(chunk) { console.log(chunk.text, chunk.elapsedMs); },
  error(err)  { console.error(err); },
  complete(summary) { console.log(summary.tokensPerSecond); },
});
```

Set `opts.trackProgress: false` for plain string chunks (no metadata).

#### `getMessages(sessionId)`

Fetch the full `messages` array from a `ChatSession` entity by ID.

```ts
const messages = await client.getMessages('session-123');
```

---

## 3. `ClientLibrary.ts` — High-Level Wrapper

**File:** `src/apis/ClientLibrary.ts`

Class wrapper around the `client` singleton. Recommended for all app code.  
Import the singleton: `import { clientLibrary } from '@/apis/ClientLibrary'`.

```ts
import { clientLibrary as lib } from '@/apis/ClientLibrary';

// LLM
const text = await lib.invoke({ prompt: 'Hello' });
const json = await lib.invoke({ prompt: 'Parse this', response_json_schema: schema });

// Streaming
lib.stream('chat', 'Tell me a joke').subscribe({ next, error, complete });
lib.stream('code', 'Write quicksort', { trackProgress: false }).subscribe(...);

// Vision
const dataUrl = await lib.encodeImage(file);
const result  = await lib.visionSend(endpoint, model, dataUrl, 'Describe');

// Vector
const vec = await lib.vector('hello world');
const idx = await lib.vectorIndex({ message: 'coral reefs', targetIndex: 'my-idx' });

// Beaming
const beam = await lib.beam('What is AI?', { taskType: 'chat', concurrency: 3 });
beam.results.forEach(r => console.log(r.model, r.status, r.response));

// Search & Tools
const terms = await lib.expandQuery('ocean plastic');
const sol   = await lib.solution('How to reduce ocean plastic?');
const web   = await lib.websearch({ prompt: 'latest AI news' });
const tools = await lib.toolbox({ prompt: 'flight NYC to LA' });

// Thinking
const stream  = lib.thinking('Solve P=NP');
const enabled = await lib.thinkingEnabled('hard problem');
const levels  = await lib.thinkingLevels('deep topic');

// Config
lib.updateConfig({ model: 'llama3:8b' });
const cfg = lib.getConfig();

// Rate limits
lib.setLimits({ maxCalls: 5, windowMs: 1000 });
lib.setLimits(null); // unlimited

// Entity access
const personas = await lib.entities.Persona.list();
const tmpl     = await lib.entities.Template.get('id-123');

// Infrastructure
lib.circuitBreaker.reset();
lib.abortManager.cancelAll();
lib.logger.info('custom log', { key: 'value' });
lib.telemetry.on('client:error', console.error);
```

### Feature-module methods

`ClientLibrary` also wraps the standalone feature modules documented in §23–§32 (plus §38 triple-validation):

```ts
// Cost estimation (§24)
lib.estimateCost(prompt, model, outputTokens?);
lib.finaliseEstimate(estimate, actualOutputTokens);
lib.getPricingTable();

// Conversation memory (§25)
lib.saveMemory(turn, embeddingModel?);
lib.recallMemory(userEmail, queryText, topK?, embeddingModel?);
lib.buildMemoryContext(userEmail, queryText, topK?, embeddingModel?);
lib.clearMemory(userEmail);

// A/B testing (§26)
lib.splitTest(variants, opts?);
lib.getABTestHistory(limit?);

// Scheduled jobs (§27)
lib.scheduleJob(jobDef);
lib.runJob(job);
lib.runDueJobs();
lib.setJobStatus(jobId, status);
lib.cancelJob(jobId);
lib.listJobs(status?);

// Grounding check (§28)
lib.groundCheck(response, sourceDocIds[], embeddingModel?);

// Endpoint failover (§29)
lib.withFailover(fn);
lib.pingEndpoints();
lib.getEndpointHealth();
lib.resetEndpointHealth();

// Triple validation benchmark (§38)
const report = await lib.tripleValidation({ models, ollamaEndpoints, embeddingModel });
```

### `lib.raw`

Direct access to the underlying low-level `client` instance for advanced usage.

---

## 4. `lib/es-entities.ts` — Elasticsearch Entity Store

**File:** `src/apis/lib/es-entities.ts`

Proxy-based entity manager backed directly by Elasticsearch.  
No React, no Axios — pure `fetch` + ES REST API.

### Config

```ts
import { getEsConfig, saveEsConfig } from '@/apis/lib/es-entities';

const cfg = getEsConfig();
// { endpoint: 'http://...', enabled: true, indices: { Persona: 'sample-prompt-persona', ... } }

saveEsConfig({ ...cfg, endpoint: 'https://my-es.example.com' });
```

### Entity CRUD

```ts
import { esEntities } from '@/apis/client';

// All methods return plain objects with { id, ...fields }
await esEntities.Persona.list('-created_date', 50);
await esEntities.Persona.filter({ status: 'active' }, '-updated_date', 20);
await esEntities.Persona.get('id-123');
await esEntities.Persona.create({ name: 'Expert', description: '...' });
await esEntities.Persona.update('id-123', { name: 'Updated' });
await esEntities.Persona.delete('id-123');
await esEntities.Persona.deleteMany({ status: 'archived' });
await esEntities.Persona.bulkCreate([{ name: 'A' }, { name: 'B' }]);
await esEntities.Persona.bulkUpdate([{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }]);
await esEntities.Persona.updateMany({ status: 'draft' }, { $set: { status: 'published' } });
await esEntities.Persona.schema();    // → JSON schema from ES mapping
esEntities.Persona.subscribe(event => console.log(event)); // polling diff, 5s interval
```

### Query operators (MongoDB-style → ES translation)

| Operator | ES translation |
|---|---|
| `{ field: value }` | `term` / `match` |
| `{ field: { $gte, $lte, $gt, $lt } }` | `range` |
| `{ field: { $in: [...] } }` | `terms` |
| `{ field: { $ne: v } }` | `must_not term` |
| `{ field: { $exists: true } }` | `exists` |
| `{ field: { $regex: 'pat' } }` | `regexp` |
| `{ $or: [...] }` | `bool.should` |
| `{ $and: [...] }` | `bool.must` |

### Index auto-naming

Unknown entity names are auto-mapped: `MyEntity` → `sample-prompt-my-entity`.

---

## 5. `lib/circuit-breaker.ts`

Tracks error rates; opens the circuit after `failureThreshold` failures, then probes after `recoveryTimeMs`.

```ts
import { createCircuitBreaker } from '@/apis/lib/circuit-breaker';

const cb = createCircuitBreaker('my-api', {
  failureThreshold: 3,     // default
  recoveryTimeMs: 30_000,  // default
  onStateChange: (state) => console.log('CB state:', state),
});

if (cb.canCall()) {
  try {
    await doSomething();
    cb.onSuccess();
  } catch {
    cb.onFailure();
  }
}

cb.reset();       // manually reset to closed
cb.state;         // 'closed' | 'open' | 'half-open'
```

**States:** `closed` (normal) → `open` (blocking) → `half-open` (one probe) → `closed` (recovered).

---

## 6. `lib/rate-limiter.ts`

Token-bucket rate limiter. Refills tokens continuously at `maxCalls / windowMs` per ms.

```ts
import { createRateLimiter } from '@/apis/lib/rate-limiter';

const limiter = createRateLimiter('llm-api', { maxCalls: 10, windowMs: 1000 });

await limiter.acquire();              // block until token available
const result = await limiter.run(() => fetchSomething()); // auto acquire

limiter.available;   // current token count (Infinity when unlimited)
limiter.reset();     // refill all tokens, clear queue

// Unlimited (no throttling):
createRateLimiter('no-limit', { unlimited: true });
createRateLimiter('no-limit', { maxCalls: 0 });
```

---

## 7. `lib/abort-manager.ts`

Global registry of named `AbortController` instances for request cancellation.

```ts
import { abortManager } from '@/apis/client';

const ctrl = abortManager.create('my-key');    // creates & registers
const sig  = abortManager.signal('my-key');    // get signal for any fetch
abortManager.cancel('my-key');                 // abort + unregister
abortManager.cancelAll();                      // abort every registered controller
abortManager.isActive('my-key');               // → boolean
```

Creating a key that already exists automatically cancels the previous controller first.

---

## 8. `lib/auth-middleware.ts`

Injects Bearer tokens and handles 401 retry with optional token refresh.

```ts
import { createAuthMiddleware } from '@/apis/lib/auth-middleware';

const auth = createAuthMiddleware({
  getToken: () => localStorage.getItem('token'),
  onRefreshNeeded: async () => { /* refresh and return new token */ return newToken; },
});

const headers = auth.injectAuthHeaders({ 'Content-Type': 'application/json' });
// → { 'Content-Type': '...', 'Authorization': 'Bearer <token>' }

const res = await auth.withAuth('https://api.example.com/data', { method: 'GET' });
// auto-injects token; retries with fresh token on 401
```

---

## 9. `lib/client-logger.ts`

Structured logger with timing support and Ollama communication summaries.

```ts
import { clientLogger } from '@/apis/client';

clientLogger.info('operation started', { model: 'qwen3' });
clientLogger.warn('retrying', { attempt: 2 });
clientLogger.error('request failed', { url: '...', statusCode: 500 });

// Timed wrapper — logs duration automatically
const result = await clientLogger.timed('InvokeLLM', async () => {
  return await someAsyncOperation();
}, { model: 'qwen3', key: 'extra-context' });
```

Calls to known Ollama operations (InvokeLLM, vector, vision, etc.) automatically log a `[ollama-comm]` summary line with a 120-char response preview.

---

## 10. `lib/telemetry.ts`

Lightweight event emitter for client lifecycle events. React components can subscribe to monitor performance without coupling to Ollama internals.

```ts
import { telemetry } from '@/apis/client';

// Subscribe
const unsubscribe = telemetry.on('client:request-start', ({ tool, timestamp }) => {
  console.log(`${tool} started at ${timestamp}`);
});

// Emit (done automatically by client internals)
telemetry.emit('client:error', { label: 'InvokeLLM', error: 'timeout' });

// Unsubscribe
unsubscribe();
```

### Built-in event names (from `lib/telemetry-events.ts`)

The full catalogue lives in [`lib/telemetry-events.ts`](#23-libtelemetry-eventsts--telemetry-event-catalogue) — always reference the `TelemetryEvents.X` constant rather than a raw string literal (raw strings not in the catalogue are a compile-time error).

| Event | Payload | Source |
|---|---|---|
| `client:request-start` | `{ tool }` | safe-execute |
| `client:request-end` | `{ tool, durationMs }` | safe-execute |
| `client:error` | `{ label, error, durationMs? }` | safe-execute |
| `client:fallback-triggered` | `{ endpoint, error }` | endpoint-failover |
| `client:circuit-open` | `{ name }` | circuit-breaker |
| `client:circuit-closed` | `{ name }` | circuit-breaker |
| `client:model-routed` | `{ task, model }` | model-router |
| `client:limits-updated` | `{ limits }` | client.setLimits |
| `client:expand-query` | `{ query, terms }` | task-orchestrator |
| `client:vector-index-created` | `{ index, entityName, hasVectorKey }` | vectorIndex |
| `app:page-view` | `{ page, path }` | Layout |
| `app:nav-click` | `{ page, label }` | Layout |
| `app:action` | `{ action, ... }` | app code |
| `ollama:request` | `{ url, label, ...reqSummary }` | ollama-tracker |
| `ollama:response` | `{ url, label, status, ...resSummary, durationMs }` | ollama-tracker |
| `ollama:error` | `{ url, label, error, durationMs }` | ollama-tracker |
| `ollama:stream-start` | `{ url, status, durationMs }` | ollama-tracker |
| `ollama:stream-complete` | `{ url, label, tokenChars, durationMs }` | ollama-tracker |
| `abtest:start` | `{ variantCount, metrics }` | ab-testing |
| `abtest:complete` | `{ winner, variantCount }` | ab-testing |
| `job:scheduled` | `{ name, cron }` | scheduled-jobs |
| `job:executed` | `{ name, durationMs, hasError }` | scheduled-jobs |
| `job:cancelled` | `{ jobId }` | scheduled-jobs |
| `ground-check:complete` | `{ docCount, flagCount, confidence }` | ground-check |
| `triple-validation:start` | `{ modelCount }` | triple-validation |
| `triple-validation:complete` | `{ modelCount, bestModel }` | triple-validation |

---

## 11. `lib/tool-registry.ts`

Dynamic plugin map for named async tools.

```ts
import { toolRegistry } from '@/apis/client';

// Register
toolRegistry.register('myTool', async (params) => {
  return { result: 'done' };
});

// Check & call
if (toolRegistry.has('myTool')) {
  const out = await toolRegistry.call('myTool', { foo: 'bar' });
}

toolRegistry.list();              // → ['InvokeLLM', 'websearch', 'myTool', ...]
toolRegistry.unregister('myTool');
toolRegistry.toCoreIntegrations(); // → { [name]: handler, ... }
```

Default-registered tools: `InvokeLLM`, `websearch`, `toolbox`, `flightTracker`, `calculator`.

---

## 12. `lib/model-router.ts`

Capability-aware model selector. Discovers available Ollama models via `/api/show` once per day,  
caches in memory → localStorage → Elasticsearch (shared across all clients).

### Cache hierarchy

1. **Memory** — instant, per-session
2. **localStorage** (`model_router_capability_cache`) — instant, per-browser
3. **Elasticsearch** (`model-router-cache` index) — one network call, shared
4. **Live Ollama discovery** (`/v1/models` + `/api/show`) — at most once per 24h

### Resolve API

```ts
import { modelRouter } from '@/apis/client';

// Positional (speed=100 = fastest model)
const model = modelRouter.resolve('chat', 'my prompt', 'fallback-model');
modelRouter.resolve('vision', '', 'llava');
modelRouter.resolve('embedding', '', 'nomic-embed-text');

// Options object (full control)
modelRouter.resolve({ TaskType: 'chat', Speed: 100 });          // fastest
modelRouter.resolve({ TaskType: 'chat', Speed: 0 });            // most capable
modelRouter.resolve({ TaskType: 'json', defaultModel: 'fb' });
modelRouter.resolve({ TaskType: 'tool_call', requiredCaps: ['tools', 'thinking'] });
modelRouter.resolve({ TaskType: 'chat', priority: 'quality' });

// All models for fan-out (beaming)
const models = modelRouter.resolveAll('chat', 'fallback');  // sorted fastest-first

// Register a custom task type
modelRouter.registerTaskType('translation', ['tools', 'completion']);
```

### Built-in task types → capability preference

| Task | Capabilities (priority order) |
|---|---|
| `chat` | `completion` |
| `json` | `tools`, `completion` |
| `tool_call` | `tools` |
| `websearch` | `tools` |
| `vision` | `vision` |
| `thinking` | `thinking` |
| `embedding` | `embeddings` |

### Speed score (0–100)

| Score | Selects |
|---|---|
| `100` | Fastest (smallest parameter count) |
| `50` | Median (average parameter count) |
| `0` | Most capable (largest parameter count) |

---

## 13. `lib/prompt-router.ts`

Enhances raw user prompts using the LLM (via modelRouter for model selection).  
Never throws — falls back to the raw prompt on any error.

```ts
import { promptRouter } from '@/apis/client';

const enhanced = await promptRouter.enhance('write about ocean', {
  TaskType: 'chat',
  Speed: 100,
  defaultModel: 'qwen3:0.6b',
  persona: {
    name: 'Marine Biologist',
    description: 'Expert in ocean ecosystems',
    instructions: 'Use scientific terminology',
  },
  temperature: 0.7,
  maxTokens: 1024,
  signal: abortController.signal,
});
```

---

## 14. `lib/endpoint-registry.ts`

Single source of truth for Ollama and Elasticsearch endpoint URLs.  
Reads localStorage once, caches in memory; `update()` invalidates cache and persists.

```ts
import { endpointRegistry } from '@/apis/lib/endpoint-registry';

endpointRegistry.ollama();          // primary Ollama endpoint string
endpointRegistry.ollamaAll();       // all Ollama endpoints (array)
endpointRegistry.elasticsearch();   // ES / vector-cloud endpoint

// After user saves config page:
endpointRegistry.update({
  ollama: ['http://new-host:11434'],
  elasticsearch: 'https://new-es.example.com',
});

endpointRegistry.invalidate();      // force re-resolve (useful in tests)
```

Auto-detection logic (when no localStorage values present):

| Environment | Ollama | Elasticsearch |
|---|---|---|
| Browser + local (`localhost`, `127.0.0.1`, `192.168.*`) | `/proxy` | `/db` |
| Node + local | `http://127.0.0.1:11434` | `http://127.0.0.1:9200` |
| Remote (production) | ngrok URL | ngrok URL |

---

## 15. `lib/request-batcher.ts`

Aggregates rapid parallel calls into a single batched execution within a `delayMs` window.

```ts
import { createBatcher } from '@/apis/lib/request-batcher';

const batchedInvoke = createBatcher<string>(
  async (batchArgs) => {
    // batchArgs: [[params1], [params2], ...]
    const settled = await Promise.allSettled(batchArgs.map(([p]) => invokeLLM(p)));
    return settled.map(r => r.status === 'fulfilled' ? r.value : Promise.reject(r.reason));
  },
  20 // ms window (default)
);

// Multiple rapid calls → single batch execution
const [r1, r2, r3] = await Promise.all([
  batchedInvoke({ prompt: 'A' }),
  batchedInvoke({ prompt: 'B' }),
  batchedInvoke({ prompt: 'C' }),
]);
```

---

## 16. `lib/safe-execute.ts`

Decorator that wraps any async call with telemetry emission, structured logging, and optional circuit-breaker enforcement.

```ts
import { safeExecute } from '@/apis/lib/safe-execute';

const result = await safeExecute({
  label: 'InvokeLLM',
  fn: () => invokeLLM(params),
  circuitBreaker,          // optional — checks canCall(), calls onSuccess/onFailure
  fallback: 'default',     // optional — returned instead of throwing on failure
});
```

Emits: `client:request-start`, `client:request-end`, `client:error` telemetry events.  
Logs via `clientLogger.timed()`.

---

## 17. `lib/progress-tracker.ts`

Augments streaming tokens with cumulative metadata (token count, elapsed time, location).

```ts
import { createProgressTracker } from '@/apis/lib/progress-tracker';

const tracker = createProgressTracker(/* optional: { lat, lng } */);

stream.subscribe({
  next(rawToken) {
    const chunk = tracker.next(rawToken);
    // chunk: { text, tokenIndex, elapsedMs, totalTokens, lat?, lng? }
  },
  complete() {
    const summary = tracker.summary();
    // summary: { totalTokens, totalElapsedMs, tokensPerSecond, timing: { ttftMs, startedAt, completedAt } }
  },
});

tracker.count;    // tokens so far
tracker.elapsed;  // ms since first token
tracker.reset();  // restart counters
```

---

## 18. `lib/task-orchestrator.ts`

Extracted business-logic operations: `expandQuery`, `solution`, `beaming`.  
Used internally by `client.integrations.Core`; also exported for direct use.

### `expandQuery(query, ollamaEndpoints, defaultModel, signal?)`

Expands a search query into 5-8 related terms via LLM.  
Returns `[originalQuery, ...expandedTerms]`.

```ts
import { expandQuery } from '@/apis/lib/task-orchestrator';
const terms = await expandQuery('coral reefs', endpoints, model);
// → ['coral reefs', 'marine biology', 'reef ecosystems', ...]
```

### `solution(prompt, ollamaEndpoints, defaultModel, signal?)`

Multi-turn persona debate → synthesized solutions manifest.

**Flow:**
1. Convert prompt → 3-5 keywords via LLM
2. Search Elasticsearch `Persona` index for 2 matching personas
3. Run 3-turn debate: analyze → critique → refine (parallel where possible)
4. Synthesize a final `manifest` from the debate

```ts
import { solution } from '@/apis/lib/task-orchestrator';
const { manifest, personas, debate } = await solution('How to reduce ocean plastic?', endpoints, model);
```

**Returns:** `{ manifest: string, personas: Persona[], debate: string[] }`

### `beaming(prompt, ollamaEndpoints, defaultModel, opts?)`

Fan-out: sends the same prompt to ALL available models in parallel (concurrency-capped).

```ts
import { beaming } from '@/apis/lib/task-orchestrator';
const result = await beaming('What is AI?', endpoints, model, {
  taskType: 'chat',    // 'chat' | 'thinking' | 'json' | 'vision'
  concurrency: 2,      // max parallel model calls (default: 2)
  signal,
});
// result.results: [{ model, status, response, error, durationMs }, ...]
```

---

## 19. `modules/vector/vector-pipeline.ts`

Full vectorization pipeline: text → keywords → Elasticsearch reindex → dense vector embeddings.

### `vectorPipeline(opts)`

```ts
import { vectorPipeline } from '@/apis/modules/vector/vector-pipeline';

const result = await vectorPipeline({
  message: 'coral reef conservation',
  ollamaEndpoints: ['http://127.0.0.1:11434'],
  chatModel: 'qwen3:0.6b',
  embeddingModel: 'nomic-embed-text',
  esEndpoint: 'http://127.0.0.1:9200',
  targetIndex: 'my-vector-index',  // created automatically if missing
  dims: 768,                        // dense_vector dimensions (default: 768)
  arrayFields: ['tags', 'expertise_areas'], // fields to embed individually
  signal,
});

// result:
// {
//   keywords: string[],          expanded keywords used for search
//   matchedCount: number,        documents matched across all indices
//   reindexStats: [...],         per-source-index { srcIndex, created, updated }
//   enrichedCount: number,       documents enriched with array-field embeddings
//   targetIndex: string,         name of the created/updated vector index
//   vectorKey: number[] | null,  dense vector for the original message
// }
```

### Pipeline steps

| Step | Action |
|---|---|
| 1 | `expandKeywords` — LLM converts message → 3-5 search keywords |
| 2 | `searchAll` — `_all` index multi-match search (one clause per keyword) |
| 3 | `ensureVectorIndex` — creates target index with `dense_vector` + dynamic mappings |
| 4 | `reindexRefs` — ES `_reindex` API copies matched docs to target index |
| 4b | `writeVectorKey` — embeds the original message → `content_vector` field |
| 5 | `enrichEmbeddings` — embeds each array-field value (pooled: max 4 concurrent) |

---

## 20. `modules/websearch/websearch-tools.ts`

Standalone web search via Ollama's OpenAI-compatible API (no external npm packages).

```ts
import { webSearch } from '@/apis/modules/websearch/websearch-tools';

const content = await webSearch({
  prompt: 'What is the current state of quantum computing?',
  ollamaEndpoints: ['http://127.0.0.1:11434'],
  defaultModel: 'qwen3:0.6b',
  model: null, // optional model override
});
// → string (assistant response content)
```

Sends `think: true` to leverage chain-of-thought reasoning for better search synthesis.

---

## 21. `modules/thinking/`

| File | Export | Description |
|---|---|---|
| `thinking-streaming.ts` | `thinkingStreamingFetch(prompt, opts)` | SSE stream with chain-of-thought blocks |
| `thinking-enabled.ts` | `thinkingEnabled(prompt, opts)` | `Promise<boolean>` — checks if model supports thinking |
| `thinking-levels.ts` | `thinkingLevels(prompt, opts)` | Returns thinking depth analysis for the prompt |

```ts
// Stream thinking response
const stream = client.integrations.Core.thinking('Solve P=NP');
stream.subscribe({ next: console.log, error: console.error, complete: () => {} });

// Check capability
const canThink = await client.integrations.Core.thinkingEnabled('hard problem');

// Depth levels
const levels = await client.integrations.Core.thinkingLevels('complex topic');
```

---

## 22. `modules/tools/`

| File | Export | Description |
|---|---|---|
| `calculator.ts` | `calculator(params)` | Arithmetic evaluation tool |
| `flight-tracker.ts` | `flightTracker(params)` | Flight status / route lookup tool |
| `multi-tool.ts` | `multiToolRun(params)` | Orchestrates multiple tools in one LLM call |

These are registered in the **tool registry** automatically by `createClient()` and accessible via:

```ts
await client.integrations.Core.toolbox({ prompt: 'flight NY to LA' });
// Internally calls multiToolRun → may invoke flightTracker, calculator, etc.
```

---

## 23. `lib/telemetry-events.ts` — Telemetry Event Catalogue

**File:** `src/apis/lib/telemetry-events.ts`

Single source of truth for every telemetry event name. The `TelemetryEvents` object maps constant names to event strings; `TelemetryEvent` is the union of all valid event strings.

```ts
import { TelemetryEvents } from '@/apis/lib/telemetry-events';
import { telemetry } from '@/apis/client';

// Always reference the constant — never a raw string literal.
telemetry.emit(TelemetryEvents.ABTEST_START, { variantCount: 2, metrics: ['clarity'] });
telemetry.on(TelemetryEvents.OLLAMA_RESPONSE, ({ url, status, durationMs }) => { /* ... */ });
```

Emitting a raw string not in the catalogue is a **compile-time error** (`TS2345`), so every event is discoverable and typo-proof. When adding a new event, register it here first.

### Constants

| Constant | Event string |
|---|---|
| `REQUEST_START` | `client:request-start` |
| `REQUEST_END` | `client:request-end` |
| `FALLBACK_TRIGGERED` | `client:fallback-triggered` |
| `CIRCUIT_OPEN` | `client:circuit-open` |
| `CIRCUIT_CLOSED` | `client:circuit-closed` |
| `MODEL_ROUTED` | `client:model-routed` |
| `VECTOR_INDEX_CREATED` | `client:vector-index-created` |
| `LIMITS_UPDATED` | `client:limits-updated` |
| `EXPAND_QUERY` | `client:expand-query` |
| `ERROR` | `client:error` |
| `PAGE_VIEW` | `app:page-view` |
| `NAV_CLICK` | `app:nav-click` |
| `APP_ACTION` | `app:action` |
| `OLLAMA_REQUEST` | `ollama:request` |
| `OLLAMA_RESPONSE` | `ollama:response` |
| `OLLAMA_ERROR` | `ollama:error` |
| `OLLAMA_STREAM_START` | `ollama:stream-start` |
| `OLLAMA_STREAM_COMPLETE` | `ollama:stream-complete` |
| `ABTEST_START` | `abtest:start` |
| `ABTEST_COMPLETE` | `abtest:complete` |
| `JOB_SCHEDULED` | `job:scheduled` |
| `JOB_EXECUTED` | `job:executed` |
| `JOB_CANCELLED` | `job:cancelled` |
| `GROUND_CHECK_COMPLETE` | `ground-check:complete` |
| `TRIPLE_VALIDATION_START` | `triple-validation:start` |
| `TRIPLE_VALIDATION_COMPLETE` | `triple-validation:complete` |

---

## 24. `lib/cost-estimator.ts` — Prompt Cost Estimator

**File:** `src/apis/lib/cost-estimator.ts`

Maps Ollama/OSS model names to approximate per-million-token USD prices (cloud-hosted equivalents — local runs are effectively $0) and estimates call cost via a ~4 chars/token heuristic.

```ts
import { estimateCost, finaliseEstimate, getPricingTable, approximateTokens } from '@/apis/lib/cost-estimator';

// Pre-call estimate (output tokens = 0)
const est = estimateCost('Hello world', 'llama3:8b');
// { model, inputTokens, outputTokens: 0, estimatedUSD, pricing }

// After a streaming call, attach the real output token count
const full = finaliseEstimate(est, 120);

// Dashboard: full model → pricing table
const table = getPricingTable();

// Fast token estimate without a tokenizer
const n = approximateTokens('some long text');
```

Exposed on `ClientLibrary` as `lib.estimateCost()`, `lib.finaliseEstimate()`, `lib.getPricingTable()`.

---

## 25. `lib/conversation-memory.ts` — Conversation Memory (RAG)

**File:** `src/apis/lib/conversation-memory.ts`

Embeds each chat turn via `/v1/embeddings` and stores it in a `dense_vector` ES index (`sample-prompt-memory`). `recallMemory()` uses ES kNN to surface the most relevant past turns; `buildMemoryContext()` returns a ready-to-inject system message.

```ts
import { saveMemory, recallMemory, buildMemoryContext, clearMemory } from '@/apis/lib/conversation-memory';

await saveMemory({ user_email, session_id, role: 'user', content }, ollamaEndpoints, 'nomic-embed-text');

const recalls = await recallMemory(userEmail, 'ocean cleanup methods', ollamaEndpoints, 'nomic-embed-text', 5);
// [{ id, score, role, content, session_id, created_date }]

const ctx = await buildMemoryContext(userEmail, 'ocean cleanup methods', ollamaEndpoints);
if (ctx) messages.unshift({ role: 'system', content: ctx });

await clearMemory(userEmail); // privacy / account deletion
```

Exposed on `ClientLibrary` as `lib.saveMemory()`, `lib.recallMemory()`, `lib.buildMemoryContext()`, `lib.clearMemory()` (endpoints auto-resolved from config).

---

## 26. `lib/ab-testing.ts` — Prompt A/B Testing

**File:** `src/apis/lib/ab-testing.ts`

Sends multiple prompt variants to the LLM, scores each response via an LLM judge on configurable metrics (default: `clarity`, `accuracy`, `helpfulness`), picks a winner, and persists the full result to ES (`sample-prompt-abtest`).

```ts
import { splitTest, getABTestHistory } from '@/apis/lib/ab-testing';

const result = await splitTest(
  [
    { label: 'concise',  prompt: 'Explain RAG', system: 'Be brief.' },
    { label: 'detailed', prompt: 'Explain RAG', system: 'Be thorough.' },
  ],
  { metrics: ['clarity', 'accuracy'], parallel: true },
  ollamaEndpoints,
  defaultModel,
);
// { variants, metrics, results: [{ label, response, scores, totalScore, durationMs }], winner, id }

const history = await getABTestHistory(20);
```

Telemetry: `abtest:start` → `abtest:complete`. Exposed on `ClientLibrary` as `lib.splitTest()` and `lib.getABTestHistory()`.

---

## 27. `lib/scheduled-jobs.ts` — Scheduled LLM Jobs

**File:** `src/apis/lib/scheduled-jobs.ts`

Persists cron-scheduled LLM job definitions to ES (`sample-prompt-scheduled-jobs`), executes them via OpenAI-style `/v1/chat/completions`, and writes each run's output to a per-job entity index.

```ts
import { scheduleJob, runDueJobs, runJob, setJobStatus, cancelJob, listJobs, nextCronDate } from '@/apis/lib/scheduled-jobs';

const job = await scheduleJob(
  { name: 'daily-summary', prompt: 'Summarize today', cronExpression: '0 9 * * *', outputEntity: 'JobOutput' },
  ollamaEndpoints, defaultModel,
);

const outputs = await runDueJobs(ollamaEndpoints, defaultModel); // execute all active & due
await runJob(job, ollamaEndpoints, defaultModel);                 // run one immediately
await setJobStatus(job.id, 'paused');
await cancelJob(job.id);
const all = await listJobs('active');

nextCronDate('0 9 * * *'); // → next fire Date
```

`ScheduledJob.status`: `active | paused | completed | error`. Telemetry: `job:scheduled`, `job:executed`, `job:cancelled`. Exposed on `ClientLibrary` as `lib.scheduleJob()`, `lib.runJob()`, `lib.runDueJobs()`, `lib.setJobStatus()`, `lib.cancelJob()`, `lib.listJobs()`.

---

## 28. `lib/ground-check.ts` — Grounding Checker

**File:** `src/apis/lib/ground-check.ts`

Verifies that an LLM response is grounded in source documents. Fetches source docs from ES by ID, embeds both the response and each source, computes cosine similarity, then asks an LLM judge to flag unsupported claims. Blends vector similarity (40%) with the LLM judge confidence (60%).

```ts
import { groundCheck } from '@/apis/lib/ground-check';

const result = await groundCheck(response, ['doc-id-1', 'doc-id-2'], ollamaEndpoints, model, 'nomic-embed-text');
// { confidence: 0.82, flags: ['...unsupported claim...'], sourcesSimilarity: [0.78, 0.85] }
```

Returns `{ confidence: 0.5, flags: ['No source documents could be retrieved'], sourcesSimilarity: [] }` when no sources resolve. Telemetry: `ground-check:complete`. Exposed on `ClientLibrary` as `lib.groundCheck()`.

---

## 29. `lib/endpoint-failover.ts` — Multi-Endpoint Failover

**File:** `src/apis/lib/endpoint-failover.ts`

Wraps any async function with automatic failover across Ollama endpoints. On failure, marks the endpoint unhealthy (cached for 30s) and retries the next; emits `client:fallback-triggered` per failure.

```ts
import { withFailover, pingEndpoints, getEndpointHealth, resetEndpointHealth } from '@/apis/lib/endpoint-failover';

const text = await withFailover(ollamaEndpoints, (endpoint) =>
  chatCompletion([endpoint], model, messages),
);

const health = await pingEndpoints(ollamaEndpoints); // [{ endpoint, healthy, latencyMs }]
const cached = getEndpointHealth();                  // [{ endpoint, healthy, failCount, lastCheckedAt }]
resetEndpointHealth();                               // clear after a config change
```

Exposed on `ClientLibrary` as `lib.withFailover(fn)`, `lib.pingEndpoints()`, `lib.getEndpointHealth()`, `lib.resetEndpointHealth()` (endpoints auto-resolved from config).

---

## 30. `lib/openai-fetch.ts` — OpenAI-Style Fetch Helpers

**File:** `src/apis/lib/openai-fetch.ts`

Thin, dependency-free wrappers for OpenAI-API-style calls to any local Ollama endpoint. All feature modules import from here to avoid a circular dependency on `client.ts`.

```ts
import { resolveEndpoint, chatCompletion, embedText, cosineSimilarity } from '@/apis/lib/openai-fetch';

const text = await chatCompletion(ollamaEndpoints, 'llama3:8b', [
  { role: 'system', content: 'Be concise.' },
  { role: 'user',   content: 'What is RAG?' },
], { temperature: 0.3, response_json_schema: schema });

const vec = await embedText(ollamaEndpoints, 'nomic-embed-text', 'hello');
const sim = cosineSimilarity(vecA, vecB); // 0..1
```

- `chatCompletion` returns parsed JSON when `response_json_schema` is set, otherwise the content string.
- `embedText` returns `null` on failure (never throws).
- `resolveEndpoint` picks the first non-empty endpoint, defaulting to `http://127.0.0.1:11434`.

---

## 31. `lib/ollama-tracker.ts` — Ollama Request/Response Tracker

**File:** `src/apis/lib/ollama-tracker.ts`

Wraps every fetch to an Ollama endpoint so the actual request body and response payload are visible in the TelemetryOverlay (not just timing). Emits `ollama:request`, `ollama:response`, `ollama:error`, `ollama:stream-start`, and `ollama:stream-complete`, and mirrors each entry into the telemetry log store.

```ts
import { trackedOllamaFetch } from '@/apis/lib/ollama-tracker';

const res = await trackedOllamaFetch(`${endpoint}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages, stream: true }),
}, 'InvokeLLM');
```

For streaming calls, it wraps the response body reader to collect content deltas and emits `ollama:stream-complete` with the full text + token count when the caller finishes reading. The client routes all Ollama / vision / embedding fetches through this helper.

---

## 32. `lib/location.ts` — Location Service

**File:** `src/apis/lib/location.ts`

Resolves the user's geographic coordinates for stream metadata. Priority: browser Geolocation API → IP geolocation (`ipapi.co`, `ip-api.com`) → default `(0, 0)`. Results cached for 5 minutes.

```ts
import { LocationService } from '@/apis/lib/location';

const { lat, lng } = await LocationService.getCurrentLocation();
LocationService.clearCache(); // force re-fetch
```

Used by `lib/progress-tracker.ts` to attach `lat` / `lng` to augmented streaming chunks.

---

## 33. `lib/app-params.ts` — Environment & App-Parameter Resolver

**File:** `src/apis/lib/app-params.ts`

SSR-safe storage and app-parameter resolution shared across the client. Provides a `localStorage` shim that falls back to an in-memory store when `window` is undefined (Node/SSR), and resolves app config from URL search params → localStorage → defaults.

```ts
import {
  localStorage,   // safe Storage (in-memory fallback in Node)
  token, appId, functionsVersion, appBaseUrl,
  APP_PREFIX, LS_PREFIX,
  getAppParams,
} from '@/apis/lib/app-params';

// Read a config value: URL ?param=… (persists to localStorage) → localStorage → default
const { ollamaEndpoints, defaultModel } = getAppParams();
```

- `LS_PREFIX` — storage key prefix derived from `appId` (e.g. `ollama_browser_tools_`).
- URL search params are sticky: once read they're saved to localStorage and the query string is stripped (when `removeFromUrl: true`).
- `appParams` — the resolved snapshot object consumed by `createClient()`.

---

## 34. `lib/config-schema.ts` — Zod Config Validation

**File:** `src/apis/lib/config-schema.ts`

Strict Zod schema for `ClientConfig`. `createClient()` runs `validateClientConfig()` for a safe check, or `parseClientConfig()` to fail fast at boot.

```ts
import { ClientConfigSchema, validateClientConfig, parseClientConfig, type ClientConfig } from '@/apis/lib/config-schema';

const { valid, errors } = validateClientConfig(maybeConfig);
if (!valid) console.warn(errors);          // ['serverUrl: serverUrl is required', …]

const cfg = parseClientConfig(maybeConfig); // throws ZodError on invalid input
```

Required fields: `serverUrl`, `appId`, `model`, `ollamaEndpoints` (non-empty array). Optional: `headers`, `functionsVersion`, `messages`, `rateLimit` (`null` = unlimited).

---

## 35. `lib/resurces.ts` — Model Capability Discovery

**File:** `src/apis/lib/resurces.ts`

Raw, dependency-free Ollama model discovery — the precursor to the cached `model-router` (§12). Lists installed models and maps each to its capabilities + parameter count.

```ts
import { fetchModelIds, capabel } from '@/apis/lib/resurces';

const ids = await fetchModelIds('http://127.0.0.1:11434');   // ['llama3:8b', 'qwen3:0.6b', …]
const caps = await capabel('http://127.0.0.1:11434');
// { tools: { 'qwen3:0.6b': 8000000000 }, vision: { 'llava:latest': 7000000000 }, … }
```

- `fetchModelIds(endpoint)` — GET `/v1/models`.
- `capabel(endpoint)` — for each model, POST `/api/show`, returning `{ capability: { modelId: paramCount } }`.

> A `.js` twin (`resurces.js`) exists for non-TS consumers. `model-router.ts` (§12) supersedes this with a memory → localStorage → ES cache hierarchy and is preferred for app code.

---

## 38. `lib/triple-validation.ts` — Triple Validation Benchmark

**File:** `src/apis/lib/triple-validation.ts`

Benchmarks available Ollama models on a personal-knowledge-graph **triple validation** task. Test cases (utterance + candidate triple + expected validity) are loaded from the `TestCase` ES entity (`sample-prompt-test-case`). Each model is asked True/False using `TRIPLE_VALIDATION_PROMPT`, then scored per model: correct / wrong / false positives / false negatives / accuracy.

```ts
import { tripleValidation, clearTripleValidationCache, TRIPLE_VALIDATION_PROMPT } from '@/apis/lib/triple-validation';
import type { TripleTestCase, ModelScore, TripleValidationReport } from '@/apis/lib/triple-validation';

const report = await tripleValidation({
  models: ['qwen3:0.6b', 'llama3:8b'],
  ollamaEndpoints: ['http://127.0.0.1:11434'],
  // optional: esIndex, signal, includePerCase, embeddingModel
});
// report.models: [{ model, correct, wrong, falsePositives, falseNegatives, accuracy, total, perCase? }]
// report.testCaseCount, report.validCount, report.invalidCount

clearTripleValidationCache(); // force re-run on next call
```

**TestCase storage convention:** `input` → utterance, `expected_output` → candidate triple, `notes` → `"valid"` | `"invalid"` (expected answer).

Results are memoised per input signature. Telemetry: `TRIPLE_VALIDATION_START` → `TRIPLE_VALIDATION_COMPLETE`. Exposed on `ClientLibrary` as `lib.tripleValidation()` (endpoints auto-resolved from config) and rendered in the app by `TripleValidationPanel`.

---

## 39. `lib/entities.ts` + `lib/functions.ts` — Axios Entity & Function Modules (legacy)

**Files:** `src/apis/lib/entities.ts`, `src/apis/lib/functions.ts`

Pre-`es-entities` Axios-backed modules. Kept for reference/back-compat; the active client (§2) uses `es-entities` (§4) for CRUD and does **not** import these.

### `createEntitiesModule(config)` — dynamic entity Proxy (Axios)

```ts
import { createEntitiesModule } from '@/apis/lib/entities';
const entities = createEntitiesModule({ axios, appId, getSocket });
await entities.Persona.list();   // Axios → backend entity API + realtime socket
```

Returns a Proxy that lazily builds a per-entity handler with list/filter/get/create/update/delete + realtime subscription. Predecessor of the ES-direct `es-entities` Proxy.

### `createFunctionsModule(axios, appId, config)` — backend function invocation

```ts
import { createFunctionsModule } from '@/apis/lib/functions';
const functions = createFunctionsModule(axios, appId, { getAuthHeaders });
const res = await functions.invoke('myFunction', { foo: 'bar' }); // POST /functions/myFunction
```

`invoke(functionName, data)` — supports JSON and `FormData`/file payloads, injects auth headers. Throws if `data` is a string (named-params object required).

---

## 40. `modules/websearch/gpt-oss-browser-tools.ts` — Browser Tool Agent

**Files:** `src/apis/modules/websearch/gpt-oss-browser-tools.ts`, `…/gpt-oss-browser-tools-helpers.ts`

An agentic browser tool loop built on the official `ollama` npm client, using Ollama's hosted `webSearch` + `webFetch` endpoints. **Requires `OLLAMA_API_KEY`** in the environment. Standalone — not used by the active client (the app's web search is `websearch-tools.ts`, §20).

```ts
import { gptOssBrowserTools } from '@/apis/modules/websearch/gpt-oss-browser-tools';
// Set OLLAMA_API_KEY before calling
await gptOssBrowserTools();
```

- Registers two tool schemas — `websearch` (query → results) and `browser_open` (open URL / scroll) — and runs an LLM tool-calling loop until the model stops.
- `gpt-oss-browser-tools-helpers.ts` exports the `Browser` state class: a page stack, per-URL page cache (`urlToPage`), token-windowed `displayPage`, and capped tool content (`CAPPED_TOOL_CONTENT_LEN = 8000`).

---

## Quick Start

```ts
// Recommended — use the singleton class wrapper
import { clientLibrary as lib } from '@/apis/ClientLibrary';

// Simple LLM call
const answer = await lib.invoke({ prompt: 'What is the speed of light?' });

// Structured JSON output
const data = await lib.invoke({
  prompt: 'List 3 ocean animals',
  response_json_schema: {
    type: 'object',
    properties: { animals: { type: 'array', items: { type: 'string' } } }
  },
});

// Streaming
lib.stream('chat', 'Tell me a story').subscribe({
  next: (chunk) => process.stdout.write(chunk.text),
  error: console.error,
  complete: (summary) => console.log(`\n${summary.tokensPerSecond} tok/s`),
});

// Entity CRUD via Elasticsearch
const personas = await lib.entities.Persona.list('-created_date', 20);
await lib.entities.Persona.create({ name: 'Expert', description: '...' });
```

---

## Environment Variables / localStorage Keys

| Key | Scope | Description |
|---|---|---|
| `ollama_endpoints` | localStorage | JSON array of Ollama endpoint URLs |
| `ollama_default_model` | localStorage | Default Ollama model name |
| `prompthub_server_url` | localStorage | Elasticsearch endpoint URL |
| `elasticsearch_config` | localStorage | Full ES config object (versioned) |
| `model_router_capability_cache` | localStorage | Cached model capability map (24h TTL) |
| `prompthub_token` | localStorage | Auth bearer token |
| `prompthub_headers` | localStorage | Extra headers JSON object |
