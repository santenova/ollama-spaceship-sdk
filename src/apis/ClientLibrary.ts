import { client, config, invokeLLM, chatCompletion as _chatCompletion, chatCompletionStream as _chatCompletionStream, generateTitle as _generateTitle, extractMemory as _extractMemory, applyQuickAction as _applyQuickAction } from './client';
import type { AugmentedChunk, StreamSummary } from './lib/progress-tracker';
import { estimateCost, finaliseEstimate, getPricingTable } from './lib/cost-estimator';
import type { CostEstimate } from './lib/cost-estimator';
import { saveMemory, recallMemory, buildMemoryContext, clearMemory } from './lib/conversation-memory';
import type { MemoryTurn, MemoryRecall } from './lib/conversation-memory';
import { splitTest, getABTestHistory } from './lib/ab-testing';
import type { ABVariant, ABTestResult } from './lib/ab-testing';
import { scheduleJob, runJob, runDueJobs, setJobStatus, cancelJob, listJobs } from './lib/scheduled-jobs';
import type { ScheduledJob, JobOutput } from './lib/scheduled-jobs';
import { groundCheck } from './lib/ground-check';
import type { GroundCheckResult } from './lib/ground-check';
import { withFailover, pingEndpoints, getEndpointHealth, resetEndpointHealth } from './lib/endpoint-failover';
import { tripleValidation } from './lib/triple-validation';
import type { TripleValidationReport } from './lib/triple-validation';
import { telemetry } from './lib/telemetry';
import { TelemetryEvents } from './lib/telemetry-events';
export { client };

type StreamTask = 'chat' | 'vision' | 'code' | 'audio' | 'thinking';
type TaskType = 'chat' | 'thinking' | 'json' | 'vision';

interface StreamObserver {
  next: (chunk: string | AugmentedChunk) => void;
  error: (err: Error) => void;
  complete: (summary?: StreamSummary) => void;
}

interface StreamSubscription {
  subscribe: (obs: StreamObserver) => void;
}

interface BeamResult {
  model: string;
  status: 'fulfilled' | 'rejected';
  response: string | null;
  error: string | null;
  durationMs: number;
}

interface BeamResponse {
  prompt: string;
  taskType: string;
  models: string[];
  results: BeamResult[];
}

/**
 * Unified class-based API for the full AI client library.
 *
 * Covers: InvokeLLM, streaming, vision, vector embeddings, vectorIndex,
 * beaming, expandQuery, solution/debate, websearch, toolbox, thinking,
 * config management, rate limiting, circuit breaker, telemetry, and entities.
 *
 * Usage:
 *   const lib = new ClientLibrary();
 *   const text = await clientLibrary.invoke("What is the speed of light?");
 *   const stream = clientLibrary.stream('chat', 'Tell me a joke');
 *   stream.subscribe({ next: console.log, error: console.error, complete: () => {} });
 */
export class ClientLibrary {
  /** Underlying low-level client — use for advanced/direct access */
  readonly raw = client;

  // ─────────────────────────────────────────────────
  // LLM Invocation
  // ─────────────────────────────────────────────────

  /**
   * Invoke the LLM with a prompt or messages array.
   * Returns parsed JSON when response_json_schema is provided, otherwise plain text.
   */
  invoke(params: Parameters<typeof client.integrations.Core.InvokeLLM>[0]): Promise<any> {
    return client.integrations.Core.InvokeLLM(params);
  }

  /**
   * Batched variant — groups parallel InvokeLLM calls within a 20ms window.
   * Use when firing many parallel calls to avoid overwhelming the host.
   */
  invokeBatched(params: any): Promise<string> {
    return client.integrations.Core.InvokeLLMBatched(params);
  }

  // ─────────────────────────────────────────────────
  // Chat Completions (OpenAI-compatible via Ollama)
  // ─────────────────────────────────────────────────

  /** Default config object (model, temperature, maxTokens, defaultVisionModel, etc.). Reflects updateConfig changes. */
  get config() { return client.getConfig(); }

  /**
   * OpenAI-compatible chat completion via Ollama.
   * Defaults from config; options override per-call (model, endpoint, temperature, signal, etc.).
   */
  chatCompletion(messages: Array<{ role: string; content: string }>, options: any = {}): Promise<string> {
    return _chatCompletion(messages, options);
  }

  /**
   * Streaming chat completion — calls onChunk(delta, full, usageData) for each token.
   */
  chatCompletionStream(
    messages: Array<{ role: string; content: string }>,
    onChunk: (delta: string, full: string, usageData: any) => void,
    options: any = {},
  ): Promise<string> {
    return _chatCompletionStream(messages, onChunk, options);
  }

  /** Generate a short title for a conversation from the first message. */
  generateTitle(firstMessage: string, options: any = {}): Promise<string> {
    return _generateTitle(firstMessage, options);
  }

  /** Extract memory/key facts from a conversation. */
  extractMemory(conversationText: string, previousMemory = '', options: any = {}): Promise<string> {
    return _extractMemory(conversationText, previousMemory, options);
  }

  /**
   * Apply a quick action transformation to a message.
   * action: 'summarize' | 'translate' | 'fix_code' | 'explain_simple' | 'improve_writing'
   */
  applyQuickAction(action: string, content: string, options: any = {}): Promise<string> {
    return _applyQuickAction(action, content, options);
  }

  // ─────────────────────────────────────────────────
  // Streaming
  // ─────────────────────────────────────────────────

  /**
   * Stream a response token-by-token for the given task and input.
   * When trackProgress is true (default), chunks are AugmentedChunk objects with metadata.
   * Set trackProgress: false for plain string chunks.
   */
  stream(
    task: StreamTask,
    input: string,
    opts?: { trackProgress?: boolean; signal?: AbortSignal },
  ): StreamSubscription {
    return client.streamResponse(task, input, opts);
  }

  // ─────────────────────────────────────────────────
  // Vision
  // ─────────────────────────────────────────────────

  /**
   * Encode a File, Blob, base64 string, or data URL into a data URL for vision requests.
   */
  encodeImage(source: string | File | Blob): Promise<string> {
    return client.integrations.Core.vision.encode(source);
  }

  /**
   * Send a vision request. Returns structured JSON when schema is provided,
   * otherwise { content, raw }.
   */
  visionSend(
    endpoint: string,
    model: string,
    imageBase64: string,
    prompt: string,
    schema?: Record<string, any> | null,
    temperature?: number,
    signal?: AbortSignal,
  ): Promise<any> {
    return client.integrations.Core.vision.send(endpoint, model, imageBase64, prompt, schema, temperature, signal);
  }

  // ─────────────────────────────────────────────────
  // Vision (high-level convenience)
  // ─────────────────────────────────────────────────

  /**
   * Analyse an image with an Ollama vision model.
   * Uses the configured endpoint + defaultVisionModel unless overridden.
   * Returns the vision model's text response.
   *
   * @param imageBase64OrUrl  base64 string (with or without data: prefix) or data URL
   * @param prompt            question / instruction for the vision model
   * @param opts              optional { model, endpoint, temperature, signal }
   */
  async analyzeImage(
    imageBase64OrUrl: string,
    prompt = 'Describe this image in detail.',
    opts: { model?: string; endpoint?: string; temperature?: number; signal?: AbortSignal } = {},
  ): Promise<string> {
    const cfg = client.getConfig();
    const endpoint = opts.endpoint || cfg.ollamaEndpoints?.[0] || 'http://127.0.0.1:11434';
    const model = opts.model || (cfg as any).defaultVisionModel || 'llava';
    const dataUrl = await client.integrations.Core.vision.encode(imageBase64OrUrl);
    const { content } = await client.integrations.Core.vision.send(
      endpoint,
      model,
      dataUrl,
      prompt,
      null,
      opts.temperature ?? 0.3,
      opts.signal,
    );
    return content ?? '';
  }

  /**
   * List available Ollama models from the configured endpoint.
   * Returns an array of model id strings.
   */
  async listAvailableModels(endpoint?: string): Promise<string[]> {
    const cfg = client.getConfig();
    const ep = endpoint || cfg.ollamaEndpoints?.[0] || 'http://127.0.0.1:11434';
    const base = ep.replace(/\/$/, '');
    const res = await fetch(`${base}/v1/models`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    return (data.data || []).map((m: any) => m.id);
  }

  /**
   * Return enriched model data from the model-router capability cache
   * and benchmark scores. Each model entry includes:
   *   - name: model id
   *   - capabilities: string[] (e.g. ['completion', 'tools', 'vision'])
   *   - paramCount: number (from /api/show)
   *   - benchmark: BenchmarkScore | null (accuracy, performanceScore, energyEfficiency, etc.)
   *   - performanceScore: number (0–100 composite: accuracy*50 + perf*30 + energy*20)
   *
   * Uses the same interface as model-router — capabilityCache + benchmarkScores.
   * Falls back to listAvailableModels() when the capability cache is empty
   * (cold start), returning models with empty capabilities and no benchmark.
   */
  getAvailableModels(): Array<{
    name: string;
    capabilities: string[];
    paramCount: number;
    benchmark: any | null;
    performanceScore: number;
  }> {
    const router = client.modelRouter;
    const capMap: Record<string, Record<string, number>> | null = router.capabilityCache;
    const benchmarks: Record<string, any> = router.benchmarkScores;

    // Build model→capabilities + paramCount from the inverted capability map
    const modelMap: Record<string, { capabilities: string[]; paramCount: number }> = {};

    if (capMap && Object.keys(capMap).length > 0) {
      for (const [cap, models] of Object.entries(capMap)) {
        for (const [modelId, paramCount] of Object.entries(models)) {
          if (!modelMap[modelId]) {
            modelMap[modelId] = { capabilities: [], paramCount };
          }
          if (!modelMap[modelId].capabilities.includes(cap)) {
            modelMap[modelId].capabilities.push(cap);
          }
          // Keep the largest paramCount seen (model may appear under multiple caps)
          if (paramCount > modelMap[modelId].paramCount) {
            modelMap[modelId].paramCount = paramCount;
          }
        }
      }
    }

    // If capability cache is empty, fall back to localStorage local AI config
    // (stored by LocalAISetupModal via getLocalAIConfig / saveLocalAIConfig)
    if (Object.keys(modelMap).length === 0) {
      try {
        const raw = typeof globalThis.localStorage !== 'undefined'
          ? globalThis.localStorage.getItem('local_ai_config')
          : null;
        if (raw) {
          const localCfg = JSON.parse(raw);
          const staticModels = localCfg?.models || {};
          if (staticModels && typeof staticModels === 'object') {
            for (const [name, details] of Object.entries(staticModels)) {
              const d = details as any;
              modelMap[name] = {
                capabilities: d?.capabilities || [],
                paramCount: 0,
              };
            }
          }
        }
      } catch {}
    }

    // Combine with benchmark scores and compute composite performance score
    return Object.entries(modelMap).map(([name, info]) => {
      const bench = benchmarks[name] || null;
      let performanceScore = 0;
      if (bench) {
        const accuracyPct = (bench.accuracy || 0) * 100;
        performanceScore = accuracyPct * 0.5 + (bench.performanceScore || 0) * 0.3 + (bench.energyEfficiency || 0) * 0.2;
      }
      return {
        name,
        capabilities: info.capabilities,
        paramCount: info.paramCount,
        benchmark: bench,
        performanceScore,
      };
    });
  }

  /** Trigger a non-blocking refresh of benchmark data from ES. */
  refreshBenchmarkScores(): Promise<void> {
    return client.modelRouter.refreshBenchmarkScores();
  }

  /** Invalidate the model-router capability + benchmark caches. */
  invalidateModelCache(): void {
    client.modelRouter.invalidateCache();
  }

  // ─────────────────────────────────────────────────
  // Vector / Embeddings
  // ─────────────────────────────────────────────────

  /**
   * Generate an embedding vector for the given text.
   * Returns number[] or null on failure.
   */
  vector(text: string, signal?: AbortSignal): Promise<number[] | null> {
    return client.integrations.Core.vector(text, signal);
  }

  /**
   * Full vector pipeline: message → keywords → ES reindex with embeddings.
   * Returns { targetIndex, vectorKey, ... }.
   */
  vectorIndex(params: {
    message: string;
    targetIndex?: string;
    dims?: number;
    arrayFields?: string[];
    signal?: AbortSignal;
  }): Promise<any> {
    return client.integrations.Core.vectorIndex(params);
  }

  // ─────────────────────────────────────────────────
  // Beaming
  // ─────────────────────────────────────────────────

  /**
   * Beam the same prompt to all available models in parallel (concurrency-capped).
   * Returns structured results per model with status, response, error, and durationMs.
   */
  beam(
    prompt: string,
    opts: { taskType?: TaskType; signal?: AbortSignal; concurrency?: number } = {},
  ): Promise<BeamResponse> {
    return client.integrations.Core.beaming(prompt, opts);
  }

  // ─────────────────────────────────────────────────
  // Query Expansion & Solution Debate
  // ─────────────────────────────────────────────────

  /**
   * Expand a query into 5-8 related terms using the LLM.
   * Always returns an array that includes the original query.
   */
  expandQuery(query: string, signal?: AbortSignal): Promise<string[]> {
    return client.integrations.Core.expandQuery(query, signal);
  }

  /**
   * Run a multi-turn persona debate to generate a solutions manifest.
   * Returns { manifest, personas, debate }.
   */
  solution(prompt: string, signal?: AbortSignal): Promise<{ manifest: string; personas: any[]; debate: string[] }> {
    return client.integrations.Core.solution(prompt, signal);
  }

  // ─────────────────────────────────────────────────
  // Web Search & Toolbox
  // ─────────────────────────────────────────────────

  /** Run a web search and return summarised results. */
  websearch(params: { prompt: string; [key: string]: any }): Promise<any> {
    return client.integrations.Core.websearch(params);
  }

  /** Run multi-tool execution (flight tracker, calculator, etc.). */
  toolbox(params: { prompt: string; [key: string]: any }): Promise<any> {
    return client.integrations.Core.toolbox(params);
  }

  // ─────────────────────────────────────────────────
  // Thinking
  // ─────────────────────────────────────────────────

  /** Stream a chain-of-thought thinking response. */
  thinking(prompt: string): ReturnType<typeof client.integrations.Core.thinking> {
    return client.integrations.Core.thinking(prompt);
  }

  /** Check whether the model supports thinking for this prompt. */
  thinkingEnabled(prompt: string, signal?: AbortSignal): Promise<any> {
    return client.integrations.Core.thinkingEnabled(prompt, signal);
  }

  /** Get thinking depth levels for this prompt. */
  thinkingLevels(prompt: string, signal?: AbortSignal): Promise<any> {
    return client.integrations.Core.thinkingLevels(prompt, signal);
  }

  // ─────────────────────────────────────────────────
  // Chat Session Messages
  // ─────────────────────────────────────────────────

  /** Retrieve the full messages array of a ChatSession by its ID. */
  getMessages(sessionId: string): Promise<any[]> {
    return client.getMessages(sessionId);
  }

  // ─────────────────────────────────────────────────
  // Config Management
  // ─────────────────────────────────────────────────

  /** Get the current resolved config. */
  getConfig() {
    return client.getConfig();
  }

  /** Live-update config (model, endpoints, headers, etc.) without recreating the client. */
  updateConfig(partial: Parameters<typeof client.updateConfig>[0]) {
    return client.updateConfig(partial);
  }

  /** Get the Elasticsearch config. */
  getEsConfig() {
    return client.getEsConfig();
  }

  /** Persist an updated Elasticsearch config. */
  saveEsConfig(cfg: any) {
    return client.saveEsConfig(cfg);
  }

  // ─────────────────────────────────────────────────
  // Rate Limiting
  // ─────────────────────────────────────────────────

  /** Set rate limit (null = unlimited). */
  setLimits(limits: { maxCalls?: number; windowMs?: number } | null) {
    return client.setLimits(limits);
  }

  /** Get current rate limit config (null = unlimited). */
  getLimits() {
    return client.getLimits();
  }

  // ─────────────────────────────────────────────────
  // Infrastructure Utilities
  // ─────────────────────────────────────────────────

  /** Circuit breaker — check, trip, and reset the primary Ollama API breaker. */
  get circuitBreaker() { return client.circuitBreaker; }

  /** Abort manager — create/cancel named AbortControllers. */
  get abortManager() { return client.abortManager; }

  /** Structured logger with timed(), info(), warn(), error(). */
  get logger() { return client.clientLogger; }

  /** Telemetry emitter — emit and subscribe to named events. */
  get telemetry() { return client.telemetry; }

  /** Tool registry — register and invoke named tools. */
  get toolRegistry() { return client.toolRegistry; }

  /** Model router — resolve optimal model per task type. */
  get modelRouter() { return client.modelRouter; }

  /** Prompt router — enhance prompts with persona context. */
  get promptRouter() { return client.promptRouter; }

  /** Auth middleware — inject auth headers into outgoing requests. */
  get authMiddleware() { return client.authMiddleware; }

  /**
   * Probe the Ollama host for compute backend (CPU/GPU) and resource details.
   * @see client.probe for full docs.
   */
  async probe() {
    return client.probe();
  }

  /**
   * Multi-entity vector search across ES indices.
   * Embeds the query and runs cosine-similarity search across multiple entity
   * indices in a single _msearch call, returning ranked de-duplicated hits.
   * @see client.multiEntitySearch for full docs.
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
    return client.multiEntitySearch(params);
  }

  // ─────────────────────────────────────────────────
  // Entity Access
  // ─────────────────────────────────────────────────

  /**
   * ES-backed entity store. Usage: clientLibrary.entities.Persona.list(), .filter(), .get(), etc.
   */
  get entities(): Record<string, any> { return client.esEntities as Record<string, any>; }

  // ─────────────────────────────────────────────────
  // Persona Management (prompt-hub ES index)
  // ─────────────────────────────────────────────────

  /**
   * Fetch all personas from the prompt-hub-persona ES index.
   * Returns normalized persona objects: { id, name, role, instructions, category, tags, ... }
   * Returns an empty array if ES is unreachable or the index doesn't exist.
   */
  async getPersonas(): Promise<any[]> {
    try {
      const personas = await (this.entities.Persona as any).list('-created_date', 1000);
      return (personas || []).map((p: any) => ({
        id: p.id,
        name: p.name || p.title || 'Unknown',
        role: p.role || p.name || p.title || 'Assistant',
        instructions: p.instructions || p.system_prompt || p.description || '',
        description: p.description || p.role || '',
        category: p.category || '',
        tags: p.tags || [],
        expertise_areas: p.expertise_areas || [],
        voice_profile: p.voice_profile || {},
        color: p.color || 'from-purple-500 to-pink-500',
        icon: p.icon || 'Users',
        is_custom: p.is_custom || false,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Automatically select the best persona for a given chat message using
   * PersonaVector semantic search.
   *
   * Flow:
   *   1. Extract the category/topic from the chat message via LLM.
   *   2. Embed the category string using the configured embedding model.
   *   3. Search the PersonaVector ES index by cosine similarity.
   *   4. Return the top match persona, or null if no vector data exists.
   *
   * Falls back to null when PersonaVector is unavailable or no match is found.
   *
   * @param chatMessage  The user's message to find a matching persona for.
   * @param topK         Number of top candidates to return (default 1).
   */
  async autoSelectPersona(chatMessage: string, topK = 1): Promise<any[] | null> {
    // Overall guard: never hang the caller — resolve to null after 30s.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
    const run = (async (): Promise<any[] | null> => {
      try {
        const cfg = client.getConfig();
        const embeddingModel = (cfg as any).embeddingModel || 'nomic-embed-text';

        // Emit: input text received for persona auto-suggest
        telemetry.emit(TelemetryEvents.PERSONA_AUTOSUGGEST_REQUEST, {
          inputText: chatMessage.slice(0, 500),
          inputLength: chatMessage.length,
          topK,
          embeddingModel,
        });

        // Step 1: Extract category via LLM (text condensation → keywords)
        const categoryResult = await client.integrations.Core.InvokeLLM({
          prompt: `Extract a concise category label (1-3 words) that best describes the topic of this message. Respond with ONLY the category, nothing else.\n\nMessage: "${chatMessage.slice(0, 500)}"`,
          response_json_schema: {
            type: 'object',
            properties: {
              category: { type: 'string' },
            },
            required: ['category'],
          },
        });
        const category = (categoryResult?.category || chatMessage.slice(0, 100)).trim();

        // Emit: extracted keywords / condensed category
        telemetry.emit(TelemetryEvents.PERSONA_AUTOSUGGEST_KEYWORDS, {
          keywords: category,
          rawCategoryResult: categoryResult?.category ?? null,
          fallbackUsed: !categoryResult?.category,
        });

        // Step 2: Embed the category string
        const embedding = await client.integrations.Core.vector(`${category} ${chatMessage.slice(0, 200)}`);
        if (!embedding || !embedding.length) return null;

        // Step 3: Search PersonaVector index by cosine similarity
        const esCfg = client.getEsConfig();
        const index = esCfg.indices?.PersonaVector || `${esCfg.indexPrefix || 'prompt-hub'}-persona-vector`;
        const searchUrl = `${esCfg.endpoint}/${index}/_search`;

        // Emit: persona vector search request
        telemetry.emit(TelemetryEvents.PERSONA_AUTOSUGGEST_SEARCH, {
          index,
          endpoint: esCfg.endpoint,
          topK,
          queryVectorDims: embedding.length,
          searchUrl,
        });

        const res = await fetch(searchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            size: topK,
            query: {
              script_score: {
                query: { match_all: {} },
                script: {
                  source: 'cosineSimilarity(params.query_vector, "embedding") + 1.0',
                  params: { query_vector: embedding },
                },
              },
            },
          }),
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        const hits = data.hits?.hits || [];
        if (!hits.length) return null;

        return hits.map((h: any) => ({
          id: h._id,
          score: h._score || 0,
          ...h._source,
        }));
      } catch {
        return null;
      }
    })();
    return Promise.race([run, timeout]);
  }

  /** ES endpoint URL. */
  get esEndpoint() { return client.esEndpoint; }

  // ─────────────────────────────────────────────────
  // 1. Prompt Cost Estimator
  // ─────────────────────────────────────────────────

  /**
   * Estimate the USD cost of an LLM call before or after execution.
   * @param prompt       Input text (prompt + system message).
   * @param model        Model name (e.g. 'llama3:8b').
   * @param outputTokens Actual output tokens from a completed call (0 = pre-call estimate).
   */
  estimateCost(prompt: string, model: string, outputTokens = 0): CostEstimate {
    return estimateCost(prompt, model, outputTokens);
  }

  /** Attach actual output token count to an existing pre-call estimate. */
  finaliseEstimate(estimate: CostEstimate, actualOutputTokens: number): CostEstimate {
    return finaliseEstimate(estimate, actualOutputTokens);
  }

  /** Return the full model → pricing table for a cost dashboard. */
  getPricingTable() {
    return getPricingTable();
  }

  // ─────────────────────────────────────────────────
  // 2. Persistent Conversation Memory (RAG)
  // ─────────────────────────────────────────────────

  /**
   * Embed and persist a chat turn to cross-session memory.
   * Call after each user/assistant exchange to build up memory over time.
   */
  saveMemory(
    turn: Omit<MemoryTurn, 'vector' | 'created_date'>,
    embeddingModel = 'nomic-embed-text',
  ): Promise<void> {
    return saveMemory(turn, client.getConfig().ollamaEndpoints, embeddingModel);
  }

  /**
   * Retrieve the top-K most semantically relevant past memory turns for a user.
   */
  recallMemory(
    userEmail: string,
    queryText: string,
    topK = 5,
    embeddingModel = 'nomic-embed-text',
  ): Promise<MemoryRecall[]> {
    return recallMemory(userEmail, queryText, client.getConfig().ollamaEndpoints, embeddingModel, topK);
  }

  /**
   * Build a ready-to-inject system message string from recalled memories.
   * Returns null when no relevant memories exist.
   */
  buildMemoryContext(
    userEmail: string,
    queryText: string,
    topK = 5,
    embeddingModel = 'nomic-embed-text',
  ): Promise<string | null> {
    return buildMemoryContext(userEmail, queryText, client.getConfig().ollamaEndpoints, embeddingModel, topK);
  }

  /** Delete all memory turns for a user (privacy / account deletion). */
  clearMemory(userEmail: string): Promise<void> {
    return clearMemory(userEmail);
  }

  // ─────────────────────────────────────────────────
  // 3. Prompt A/B Testing
  // ─────────────────────────────────────────────────

  /**
   * Run a split test across multiple prompt variants.
   * Each variant is sent to the LLM, scored by an LLM judge, and results
   * are persisted to Elasticsearch. Returns the winner and full score breakdown.
   */
  splitTest(
    variants: ABVariant[],
    opts: { metrics?: string[]; signal?: AbortSignal; parallel?: boolean } = {},
  ): Promise<ABTestResult> {
    const cfg = client.getConfig();
    return splitTest(variants, opts, cfg.ollamaEndpoints, cfg.model);
  }

  /** Retrieve past A/B test results from ES. */
  getABTestHistory(limit = 20): Promise<ABTestResult[]> {
    return getABTestHistory(limit);
  }

  // ─────────────────────────────────────────────────
  // 4. Scheduled / Async LLM Jobs
  // ─────────────────────────────────────────────────

  /**
   * Create a scheduled LLM job that fires on a cron expression.
   * Output is written to the specified ES entity index on each run.
   */
  scheduleJob(
    jobDef: Omit<ScheduledJob, 'id' | 'status' | 'created_date' | 'updated_date' | 'nextRunAt' | 'runCount'>,
  ): Promise<ScheduledJob> {
    const cfg = client.getConfig();
    return scheduleJob(jobDef, cfg.ollamaEndpoints, cfg.model);
  }

  /** Immediately execute a single job regardless of its schedule. */
  runJob(job: ScheduledJob): Promise<JobOutput> {
    const cfg = client.getConfig();
    return runJob(job, cfg.ollamaEndpoints, cfg.model);
  }

  /**
   * Find all active jobs whose nextRunAt is in the past and execute them.
   * Wire this to a polling interval or a backend automation.
   */
  runDueJobs(): Promise<JobOutput[]> {
    const cfg = client.getConfig();
    return runDueJobs(cfg.ollamaEndpoints, cfg.model);
  }

  /** Pause or resume a scheduled job. */
  setJobStatus(jobId: string, status: 'active' | 'paused'): Promise<void> {
    return setJobStatus(jobId, status);
  }

  /** Permanently cancel and delete a scheduled job. */
  cancelJob(jobId: string): Promise<void> {
    return cancelJob(jobId);
  }

  /** List all scheduled jobs, optionally filtered by status. */
  listJobs(status?: ScheduledJob['status']): Promise<ScheduledJob[]> {
    return listJobs(status);
  }

  // ─────────────────────────────────────────────────
  // 7. Hallucination / Grounding Checker
  // ─────────────────────────────────────────────────

  /**
   * Check whether an LLM response is grounded in the provided source documents.
   * Fetches source docs from ES, embeds both response and sources, computes cosine
   * similarity, then uses an LLM judge to flag unsupported claims.
   *
   * @param response      LLM response text to verify.
   * @param sourceDocIds  Array of ES document IDs to use as ground-truth sources.
   * @param embeddingModel Embedding model (default: nomic-embed-text).
   */
  groundCheck(
    response: string,
    sourceDocIds: string[],
    embeddingModel = 'nomic-embed-text',
  ): Promise<GroundCheckResult> {
    const cfg = client.getConfig();
    return groundCheck(response, sourceDocIds, cfg.ollamaEndpoints, cfg.model, embeddingModel);
  }

  // ─────────────────────────────────────────────────
  // 8. Multi-Endpoint Failover
  // ─────────────────────────────────────────────────

  /**
   * Execute a function with automatic failover across all configured endpoints.
   * On failure, tries the next endpoint; unhealthy endpoints are skipped for 30s.
   *
   * @param fn  Function receiving a single endpoint string, returning a Promise.
   */
  withFailover<T>(fn: (endpoint: string) => Promise<T>): Promise<T> {
    return withFailover(client.getConfig().ollamaEndpoints, fn);
  }

  /** Ping all configured endpoints and return latency + health status. */
  pingEndpoints(): Promise<Array<{ endpoint: string; healthy: boolean; latencyMs: number }>> {
    return pingEndpoints(client.getConfig().ollamaEndpoints);
  }

  /** Return cached health state of all known endpoints. */
  getEndpointHealth() {
    return getEndpointHealth();
  }

  /** Reset cached endpoint health (e.g. after adding a new endpoint). */
  resetEndpointHealth(): void {
    resetEndpointHealth();
  }

  // ─────────────────────────────────────────────────
  // Model Performance Data (PromptHubTestResult entity)
  // ─────────────────────────────────────────────────

  /**
   * Fetch aggregated performance data for each model from the
   * PromptHubTestResult base44 entity.
   *
   * Returns a map: { [model_name]: { latest, best, all } }
   * - latest: most recent test result
   * - best:   highest performance_score result
   * - all:    every result record for the model
   */
  async getModelPerformance(): Promise<Record<string, {
    latest: any;
    best: any;
    all: any[];
  }>> {
    try {
      const results = await (this.entities.TestResult as any).list('-created_date', 200);
      const map: Record<string, { latest: any; best: any; all: any[] }> = {};
      for (const r of results || []) {
        const name = r.model_name;
        if (!name) continue;
        if (!map[name]) map[name] = { latest: null, best: null, all: [] };
        map[name].all.push(r);
        if (!map[name].latest) map[name].latest = r; // sorted desc, first is latest
        if (!map[name].best || (r.performance_score || 0) > (map[name].best.performance_score || 0)) {
          map[name].best = r;
        }
      }
      return map;
    } catch {
      return {};
    }
  }

  // ─────────────────────────────────────────────────
  // 10. Triple Validation Benchmark
  // ─────────────────────────────────────────────────

  /**
   * Benchmark available models on the triple-validation task.
   * Loads test cases (utterance + triple + expected validity) from the
   * `TestCase` ES index and scores each model: correct / wrong / FP / FN.
   *
   * @param opts.models         Restrict to a specific model list (default: all from /v1/models).
   * @param opts.testCaseIndex  Override the ES index holding test cases.
   * @param opts.includePerCase Attach per-case predictions to each model score.
   */
  tripleValidation(
    opts: { models?: string[]; testCaseIndex?: string; signal?: AbortSignal; includePerCase?: boolean } = {},
  ): Promise<TripleValidationReport> {
    const cfg = client.getConfig();
    return tripleValidation(cfg.ollamaEndpoints, cfg.model, opts);
  }
}

/** Singleton instance — import and use directly without instantiating. */
export const clientLibrary = new ClientLibrary();
