/**
 * Prompt Cost Estimator
 *
 * Maps Ollama/OSS model names to approximate per-token USD costs
 * (based on typical hosted equivalents or community benchmarks).
 * Estimation uses the ~4 chars/token heuristic for input;
 * output tokens are measured post-call via progress-tracker.
 *
 * Usage:
 *   const est = estimateCost('Hello world', 'llama3:8b');
 *   // { inputTokens: 3, outputTokens: 0, estimatedUSD: 0.0000045 }
 *
 *   // After a streaming call, pass actual output token count:
 *   const full = estimateCost(prompt, model, actualOutputTokens);
 */
export interface CostEstimate {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedUSD: number;
    /** Per-million-token prices used for calculation. */
    pricing: {
        inputPerMillion: number;
        outputPerMillion: number;
    };
}
/**
 * USD per 1M tokens { input, output }.
 * OSS models running locally are effectively $0 — these reflect
 * cloud-hosted equivalent pricing for cost-attribution dashboards.
 */
declare const MODEL_PRICING: Record<string, {
    inputPerMillion: number;
    outputPerMillion: number;
}>;
/**
 * Estimate token count from a string using the ~4 chars/token heuristic.
 * This is fast and good enough for cost attribution — no tokeniser required.
 */
export declare function approximateTokens(text: string): number;
/**
 * Estimate the cost of an LLM call.
 *
 * @param prompt       The input text (prompt + system message combined).
 * @param model        Model name (e.g. 'llama3:8b', 'qwen3:0.6b').
 * @param outputTokens Actual output tokens from a completed call (0 = pre-call estimate).
 */
export declare function estimateCost(prompt: string, model: string, outputTokens?: number): CostEstimate;
/** Add output token pricing to an existing estimate (post-call update). */
export declare function finaliseEstimate(estimate: CostEstimate, actualOutputTokens: number): CostEstimate;
/** Return the full pricing table (useful for a cost dashboard). */
export declare function getPricingTable(): typeof MODEL_PRICING;
export {};
