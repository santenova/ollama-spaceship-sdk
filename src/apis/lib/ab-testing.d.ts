/**
 * Prompt A/B Testing Framework
 *
 * Sends multiple prompt variants to the LLM via /v1/chat/completions,
 * scores each response via an LLM judge, and persists results to ES.
 */
export interface ABVariant {
    label: string;
    prompt: string;
    system?: string;
    model?: string;
}
export interface ABMetricScore {
    metric: string;
    score: number;
    reasoning: string;
}
export interface ABVariantResult {
    label: string;
    prompt: string;
    response: string;
    scores: ABMetricScore[];
    totalScore: number;
    durationMs: number;
    error?: string;
}
export interface ABTestResult {
    id?: string;
    variants: ABVariant[];
    metrics: string[];
    results: ABVariantResult[];
    winner: string | null;
    created_date: string;
}
/** Run a full A/B test: execute variants, judge responses, persist results. */
export declare function splitTest(variants: ABVariant[], opts: {
    metrics?: string[];
    signal?: AbortSignal;
    parallel?: boolean;
}, ollamaEndpoints: string[], defaultModel: string): Promise<ABTestResult>;
/** Retrieve past A/B test results from ES. */
export declare function getABTestHistory(limit?: number): Promise<ABTestResult[]>;
