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
/**
 * USD per 1M tokens { input, output }.
 * OSS models running locally are effectively $0 — these reflect
 * cloud-hosted equivalent pricing for cost-attribution dashboards.
 */
const MODEL_PRICING = {
    // Qwen3 family
    'qwen3:0.6b': { inputPerMillion: 0.06, outputPerMillion: 0.18 },
    'qwen3:1.7b': { inputPerMillion: 0.10, outputPerMillion: 0.30 },
    'qwen3:4b': { inputPerMillion: 0.20, outputPerMillion: 0.60 },
    'qwen3:8b': { inputPerMillion: 0.40, outputPerMillion: 1.20 },
    'qwen3:14b': { inputPerMillion: 0.80, outputPerMillion: 2.40 },
    'qwen3:32b': { inputPerMillion: 1.20, outputPerMillion: 3.60 },
    'qwen3:72b': { inputPerMillion: 2.00, outputPerMillion: 6.00 },
    // Llama 3 family
    'llama3:8b': { inputPerMillion: 0.20, outputPerMillion: 0.60 },
    'llama3:70b': { inputPerMillion: 0.90, outputPerMillion: 2.70 },
    'llama3.1:8b': { inputPerMillion: 0.20, outputPerMillion: 0.60 },
    'llama3.2': { inputPerMillion: 0.20, outputPerMillion: 0.60 },
    'llama3.2:1b': { inputPerMillion: 0.06, outputPerMillion: 0.18 },
    'llama3.2:3b': { inputPerMillion: 0.10, outputPerMillion: 0.30 },
    // Mistral family
    'mistral:7b': { inputPerMillion: 0.25, outputPerMillion: 0.75 },
    'mistral-nemo': { inputPerMillion: 0.15, outputPerMillion: 0.45 },
    'mixtral:8x7b': { inputPerMillion: 0.60, outputPerMillion: 1.80 },
    // Gemma family
    'gemma2:2b': { inputPerMillion: 0.10, outputPerMillion: 0.30 },
    'gemma2:9b': { inputPerMillion: 0.30, outputPerMillion: 0.90 },
    'gemma2:27b': { inputPerMillion: 0.80, outputPerMillion: 2.40 },
    // Phi family
    'phi3:mini': { inputPerMillion: 0.08, outputPerMillion: 0.24 },
    'phi3:medium': { inputPerMillion: 0.25, outputPerMillion: 0.75 },
    'phi4': { inputPerMillion: 0.30, outputPerMillion: 0.90 },
    // Embedding models — output is the vector, no output cost
    'nomic-embed-text': { inputPerMillion: 0.01, outputPerMillion: 0 },
    'mxbai-embed-large': { inputPerMillion: 0.02, outputPerMillion: 0 },
    // DeepSeek
    'deepseek-r1:7b': { inputPerMillion: 0.20, outputPerMillion: 0.60 },
    'deepseek-r1:14b': { inputPerMillion: 0.55, outputPerMillion: 2.19 },
    'deepseek-r1:32b': { inputPerMillion: 0.55, outputPerMillion: 2.19 },
    'deepseek-r1:70b': { inputPerMillion: 2.00, outputPerMillion: 6.00 },
    // CodeLlama
    'codellama:7b': { inputPerMillion: 0.20, outputPerMillion: 0.60 },
    'codellama:13b': { inputPerMillion: 0.40, outputPerMillion: 1.20 },
};
/** Fallback pricing for unrecognised models — mid-tier estimate. */
const DEFAULT_PRICING = { inputPerMillion: 0.50, outputPerMillion: 1.50 };
/** Resolve pricing for a model name, supporting partial prefix matches. */
function resolvePricing(model) {
    // Exact match
    if (MODEL_PRICING[model])
        return MODEL_PRICING[model];
    // Prefix match (e.g. 'llama3.2:3b-instruct' → 'llama3.2:3b')
    const modelLower = model.toLowerCase();
    for (const [key, price] of Object.entries(MODEL_PRICING)) {
        if (modelLower.startsWith(key.toLowerCase()))
            return price;
    }
    return DEFAULT_PRICING;
}
/**
 * Estimate token count from a string using the ~4 chars/token heuristic.
 * This is fast and good enough for cost attribution — no tokeniser required.
 */
export function approximateTokens(text) {
    if (!text)
        return 0;
    return Math.max(1, Math.ceil(text.length / 4));
}
/**
 * Estimate the cost of an LLM call.
 *
 * @param prompt       The input text (prompt + system message combined).
 * @param model        Model name (e.g. 'llama3:8b', 'qwen3:0.6b').
 * @param outputTokens Actual output tokens from a completed call (0 = pre-call estimate).
 */
export function estimateCost(prompt, model, outputTokens = 0) {
    const pricing = resolvePricing(model);
    const inputTokens = approximateTokens(prompt);
    const estimatedUSD = (inputTokens / 1000000) * pricing.inputPerMillion +
        (outputTokens / 1000000) * pricing.outputPerMillion;
    return {
        model,
        inputTokens,
        outputTokens,
        estimatedUSD: parseFloat(estimatedUSD.toFixed(8)),
        pricing,
    };
}
/** Add output token pricing to an existing estimate (post-call update). */
export function finaliseEstimate(estimate, actualOutputTokens) {
    const outputCost = (actualOutputTokens / 1000000) * estimate.pricing.outputPerMillion;
    const inputCost = (estimate.inputTokens / 1000000) * estimate.pricing.inputPerMillion;
    return {
        ...estimate,
        outputTokens: actualOutputTokens,
        estimatedUSD: parseFloat((inputCost + outputCost).toFixed(8)),
    };
}
/** Return the full pricing table (useful for a cost dashboard). */
export function getPricingTable() {
    return { ...MODEL_PRICING };
}
