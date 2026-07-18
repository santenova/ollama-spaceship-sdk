/**
 * Multi-tool run — Ollama OpenAI-compatible tool-calling demo.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below is the one
 * that was previously inlined in `apis/client.ts` and is the actually-used
 * implementation — it relies on plain `fetch` against the
 * `/v1/chat/completions` endpoint so it works in both browser and Node.
 */

interface ChatMessage {
  role: string;
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  [key: string]: any;
}

/**
 * Standalone multiToolRun — calls Ollama's OpenAI-compatible
 * /v1/chat/completions endpoint with mock weather tools.
 * Accepts an optional prompt (defaults to a weather demo prompt) and
 * returns the accumulated assistant content string.
 */
export async function multiToolRun(opts: {
  prompt?: string;
  model?: string | null;
  ollamaEndpoints: string[];
  defaultModel: string;
}) {
  const {
    prompt,
    model: requestedModel = null,
    ollamaEndpoints,
    defaultModel,
  } = opts || {};

  const host =
    ollamaEndpoints[1] || ollamaEndpoints[0] || 'http://localhost:11434';
  const useModel = requestedModel || defaultModel || 'qwen3:0.6b';

  const cities = ['London', 'Paris', 'New York', 'Tokyo', 'Sydney'];
  const city = cities[Math.floor(Math.random() * cities.length)];
  const city2 = cities[Math.floor(Math.random() * cities.length)];

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: prompt || `What is the temperature in ${city}? and what are the weather conditions in ${city2}?`,
    },
  ];

  const getTemperature = (args: { city: string }): string => {
    if (!cities.includes(args.city)) return 'Unknown city';
    return `${Math.floor(Math.random() * 36)} degrees Celsius`;
  };

  const getConditions = (args: { city: string }): string => {
    if (!cities.includes(args.city)) return 'Unknown city';
    const conditions = ['sunny', 'cloudy', 'rainy', 'snowy'];
    return conditions[Math.floor(Math.random() * conditions.length)];
  };

  const toolSchemas = [
    {
      type: 'function' as const,
      function: {
        name: 'getTemperature',
        description: 'Get the temperature for a city in Celsius',
        parameters: {
          type: 'object',
          required: ['city'],
          properties: {
            city: { type: 'string', description: 'The name of the city' },
          },
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'getConditions',
        description: 'Get the weather conditions for a city',
        parameters: {
          type: 'object',
          required: ['city'],
          properties: {
            city: { type: 'string', description: 'The name of the city' },
          },
        },
      },
    },
  ];

  const availableFunctions: Record<string, (args: { city: string }) => string> = {
    getTemperature,
    getConditions,
  };

  // First pass: ask model what tools to call
  const res1 = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: useModel, messages, tools: toolSchemas, stream: false }),
  });
  if (!res1.ok) throw new Error(`multiToolRun error: ${res1.status}`);
  const data1: any = await res1.json();
  const assistantMsg = data1?.choices?.[0]?.message;
  if (!assistantMsg) return '';

  messages.push(assistantMsg);

  if (assistantMsg.tool_calls?.length) {
    for (const tool of assistantMsg.tool_calls) {
      const fn = availableFunctions[tool.function?.name];
      if (fn) {
        const output = fn(tool.function.arguments as any);
        messages.push({ role: 'tool', content: output.toString(), tool_call_id: tool.id } as ChatMessage);
      }
    }
    // Second pass: get final answer with tool results
    const res2 = await fetch(`${host}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: useModel, messages, stream: false }),
    });
    if (!res2.ok) throw new Error(`multiToolRun final error: ${res2.status}`);
    const data2: any = await res2.json();
    return data2?.choices?.[0]?.message?.content ?? '';
  }

  return assistantMsg.content ?? '';
}