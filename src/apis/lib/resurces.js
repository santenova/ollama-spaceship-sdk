export async function fetchModelIds(endpoint = 'http://localhost:11434') {
    const response = await fetch(`${endpoint}/v1/models`);
    if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.data.map((model) => model.id);
}
async function fetchModelCapabilities(modelId, endpoint = 'http://localhost:11434') {
    const response = await fetch(`${endpoint}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
    });
    if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return {
        model: modelId,
        capabilities: data.capabilities ?? [],
        modified: data.modified_at,
        paramCount: data.model_info?.['general.parameter_count'] ?? 0,
    };
}
/**
 * Returns a map of capability → { [modelId]: paramCount }
 * e.g. { tools: { 'qwen3:0.6b': 8000000000 }, vision: { 'llava:latest': 7000000000 } }
 */
export async function capabel(endpoint = 'http://localhost:11434') {
    const modelIds = await fetchModelIds(endpoint);
    const allTools = {};
    for (const model of modelIds) {
        try {
            const info = await fetchModelCapabilities(model, endpoint);
            for (const cap of info.capabilities) {
                if (!allTools[cap])
                    allTools[cap] = {};
                allTools[cap][model] = info.paramCount;
            }
        }
        catch (error) {
            console.error(`Error fetching capabilities for model ${model}: ${error.message}`);
        }
    }
    return allTools;
}
