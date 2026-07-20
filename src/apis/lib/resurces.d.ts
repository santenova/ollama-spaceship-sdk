export declare function fetchModelIds(endpoint?: string): Promise<string[]>;
/**
 * Returns a map of capability → { [modelId]: paramCount }
 * e.g. { tools: { 'qwen3:0.6b': 8000000000 }, vision: { 'llava:latest': 7000000000 } }
 */
export declare function capabel(endpoint?: string): Promise<Record<string, Record<string, number>>>;
