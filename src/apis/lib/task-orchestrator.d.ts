/**
 * TaskOrchestrator — extracted business-logic methods from client.ts (#3)
 * Houses `solution`, `beaming`, and `expandQuery` so client.ts stays focused
 * on networking and configuration.
 *
 * All methods accept `ollamaEndpoints` and `defaultModel` so they work with
 * the live resolved values from the parent client.
 */
export declare function expandQuery(query: string, ollamaEndpoints: string[], defaultModel: string, signal?: AbortSignal): Promise<string[]>;
export declare function solution(prompt: string, ollamaEndpoints: string[], defaultModel: string, signal?: AbortSignal): Promise<{
    manifest: string;
    personas: any[];
    debate: string[];
}>;
export declare function beaming(prompt: string, ollamaEndpoints: string[], defaultModel: string, opts?: {
    taskType?: 'chat' | 'thinking' | 'json' | 'vision';
    signal?: AbortSignal;
    concurrency?: number;
}): Promise<{
    prompt: string;
    taskType: string;
    models: string[];
    results: Array<{
        model: string;
        status: 'fulfilled' | 'rejected';
        response: string | null;
        error: string | null;
        durationMs: number;
    }>;
}>;
