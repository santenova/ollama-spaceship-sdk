export async function fetchModelIds(endpoint = 'http://localhost:11434'): Promise<string[]> {
  const response = await fetch(`${endpoint}/v1/models`);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const data = await response.json();
  return data.data.map((model: { id: string }) => model.id);
}

async function fetchModelCapabilities(modelId: string, endpoint = 'http://localhost:11434') {
  const response = await fetch(`${endpoint}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId }),
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const data = await response.json();
  return {
    model: modelId,
    capabilities: (data.capabilities as string[]) ?? [],
    modified: data.modified_at as string,
    paramCount: (data.model_info?.['general.parameter_count'] as number) ?? 0,
  };
}

/**
 * Returns a map of capability → { [modelId]: paramCount }
 * e.g. { tools: { 'qwen3:0.6b': 8000000000 }, vision: { 'llava:latest': 7000000000 } }
 */
export async function capabel(endpoint = 'http://localhost:11434'): Promise<Record<string, Record<string, number>>> {
  const modelIds = await fetchModelIds(endpoint);
  const allTools: Record<string, Record<string, number>> = {};

  for (const model of modelIds) {
    try {
      const info = await fetchModelCapabilities(model, endpoint);
      for (const cap of info.capabilities) {
        if (!allTools[cap]) allTools[cap] = {};
        allTools[cap][model] = info.paramCount;
      }
    } catch (error: any) {
      console.error(`Error fetching capabilities for model ${model}: ${error.message}`);
    }
  }
  return allTools;
}
