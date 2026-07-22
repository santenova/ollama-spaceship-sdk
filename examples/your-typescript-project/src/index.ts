
import { createClient, modelRouter , TelemetryEvents, telemetry } from '@santex/ollama-spaceship-sdk';

async function  autoSelectPersona(chatMessage: string, topK = 1): Promise<any[] | null> {
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



const client = createClient({
  serverUrl: 'http://127.0.0.1:9200',   // Elasticsearch endpoint
  appId: 'my-app',
  model: 'qwen3:0.6b',                   // default Ollama model
  ollamaEndpoints: ['http://127.0.0.1:11434'],
  headers: { 'X-App-Id': 'my-app' },
  rateLimit: null   

  //rateLimit: { maxCalls: 20, windowMs: 1000 }, // null = unlimited
});


const userPrompt = 'write about ocean rescue efforts, create an ultra smart inventory system of projects and other relevant actors, the indices need be able to be reduced by geo-search + vector search + user query , and an array of project  scores like funding, members, efficency, avg turnout in tonnes  many as possible! locations funding project score in terms time,cost, technology consider that ';

console.log({'userPrompt':userPrompt});


const enhanced = await client.promptRouter.enhance(userPrompt, {
  TaskType: 'chat',
  stream: true,
  Speed: 100,
  defaultModel: 'qwen3:0.6b',
  persona: {
    name: 'Marine Biologist',
    description: 'Expert in ocean ecosystems',
    instructions: 'Use scientific terminology',
  },
  temperature: 0.7,
  maxTokens: 2048
});

console.log({'enhanced':enhanced});


// Stream thinking response
const stream = client.integrations.Core.thinking('Solve the Ocean Cleanup in 7 steps ,  explain step 1 - 7 finish with summary');

console.log({'stream':stream});

// Check capability
const canThink = await client.integrations.Core.thinkingEnabled('Ocean Cleanup 20 counter strategies for antizipsatzed problems');

console.log({'canThink':canThink});


// Depth levels
const levels = await client.integrations.Core.thinkingLevels('Top 7 domains involved in Ocean Cleanup success');

console.log({'levels':levels});


// Positional (speed=100 = fastest model)
const model = modelRouter.resolve('chat',enhanced, 'qwen3:0.6b');
modelRouter.resolve('vision', '', 'llava:7b');
modelRouter.resolve('embedding', '', 'nomic-embed-text:latest');

// Options object (full control)
modelRouter.resolve({ TaskType: 'chat', Speed: 100 });          // fastest
modelRouter.resolve({ TaskType: 'chat', Speed: 0 });            // most capable
modelRouter.resolve({ TaskType: 'json', defaultModel: 'fb' });
modelRouter.resolve({ TaskType: 'tool_call', requiredCaps: ['tools', 'thinking'] });
modelRouter.resolve({ TaskType: 'chat', priority: 'quality' });




console.log({'modelRouter':modelRouter});
// All models for fan-out (beaming)
const models = modelRouter.resolveAll('chat', 'fallback');  // sorted fastest-first


console.log({'models-by-speed':models});
// All models for fan-out (beaming)
// Register a custom task type
//modelRouter.registerTaskType('translation', ['tools', 'completion']);

