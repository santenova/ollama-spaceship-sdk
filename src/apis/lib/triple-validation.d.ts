/**
 * Triple Validation Benchmark
 *
 * Benchmarks available Ollama models on a personal-knowledge-graph triple
 * validation task. Test cases (utterance + candidate triple + expected
 * validity) are loaded from the `TestCase` ES entity (index
 * `sample-prompt-test-case` by default). Each model is asked to answer
 * True/False using TRIPLE_VALIDATION_PROMPT, then scored per model:
 *   correct / wrong / false positives / false negatives — matching the
 * Python benchmark loop (valid cases → FN on miss, invalid cases → FP on miss).
 *
 * TestCase storage convention:
 *   input           → utterance the user spoke
 *   expected_output → candidate triple, e.g. "(user, schema:favoriteColor, green)"
 *   notes           → "valid" | "invalid"  (expected model answer)
 */
export declare const TRIPLE_VALIDATION_PROMPT = "You are a triple validator for a personal knowledge graph.\n\nGiven an utterance that a user spoke to a voice assistant and a candidate triple, your task is to validate the triple\n\nUtterances about the user usually have the form of \"I am ....\" or \"My ...\"\n\nUtterances about the assistant usually have the form of \"You are ....\" or \"Your ...\"\n\nKnowledge about the broader world should be discarded, you are only interested in personal information about the user or the voice assistant\n\nEach triple is in the format:\n(subject, predicate, object)\n\nOnly return 'True' if:\n- The subject is 'self' (the assistant) or 'user' (the user)\n- The triple is about user or assistant personal information\n- The triple is factually plausible and makes sense\n- The triple DOES NOT contradict the utterance\n\nOtherwise, return 'False'.\n\nExamples of valid triples:\n\"my favorite color is green\" - (\"user\", \"schema:favoriteColor\", \"green\")\n\"your favorite color is blue\" - (\"self\", \"schema:favoriteColor\", \"blue\")\n\nExamples of invalid triples:\n\"my favorite color is green\" - (\"user\", \"schema:favoriteColor\", \"red\")\n\"I love the color green\" - (\"self\", \"schema:favoriteColor\", \"green\")\n\"your favorite color is blue\" - (\"user\", \"schema:favoriteColor\", \"blue\")\n\nYOU MUST answer with only one word: True or False.\n\nThe user said: \"{utterance}\"\n\nCandidate triple: {triple}\n";
/** Invalidate the cached benchmark report (forces a fresh run next call). */
export declare function clearTripleValidationCache(): void;
export interface TripleTestCase {
    id: string;
    utterance: string;
    triple: string;
    expectedValid: boolean;
}
export interface CaseResult {
    utterance: string;
    triple: string;
    expected: boolean;
    actual: boolean | null;
    passed: boolean;
    raw: string;
}
export interface ModelScore {
    model: string;
    endpoint: string;
    correct: number;
    wrong: number;
    /** Model answered True on an invalid case. */
    falsePositives: number;
    /** Model answered False on a valid case. */
    falseNegatives: number;
    errors: number;
    total: number;
    /** correct / total (0 when no cases). */
    accuracy: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
    perCase?: CaseResult[];
}
export interface TripleValidationReport {
    models: ModelScore[];
    testCaseCount: number;
    validCount: number;
    invalidCount: number;
    endpoint: string;
    created_date: string;
}
/**
 * Benchmark available models on the triple-validation task.
 *
 * @param ollamaEndpoints  Active Ollama endpoints.
 * @param defaultModel     Fallback model when /v1/models is unreachable.
 * @param opts.models      Restrict to a specific model list (default: all from /v1/models).
 * @param opts.testCaseIndex  Override the ES index holding test cases.
 * @param opts.includePerCase  Attach per-case predictions to each model score.
 */
export declare function tripleValidation(ollamaEndpoints: string[], defaultModel: string, opts?: {
    models?: string[];
    testCaseIndex?: string;
    signal?: AbortSignal;
    includePerCase?: boolean;
    caseLimit?: number;
    modelLimit?: number;
}): Promise<TripleValidationReport>;
