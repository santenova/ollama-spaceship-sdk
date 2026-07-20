/**
 * Telemetry event catalogue (#5)
 * Single source of truth for all event names. Import `TelemetryEvents`
 * to reference event names without relying on raw string literals.
 */
export const TelemetryEvents = {
    // Client lifecycle
    REQUEST_START: 'client:request-start',
    REQUEST_END: 'client:request-end',
    FALLBACK_TRIGGERED: 'client:fallback-triggered',
    CIRCUIT_OPEN: 'client:circuit-open',
    CIRCUIT_CLOSED: 'client:circuit-closed',
    MODEL_ROUTED: 'client:model-routed',
    VECTOR_INDEX_CREATED: 'client:vector-index-created',
    LIMITS_UPDATED: 'client:limits-updated',
    EXPAND_QUERY: 'client:expand-query',
    ERROR: 'client:error',
    // App navigation
    PAGE_VIEW: 'app:page-view',
    NAV_CLICK: 'app:nav-click',
    APP_ACTION: 'app:action',
    // Ollama
    OLLAMA_REQUEST: 'ollama:request',
    OLLAMA_RESPONSE: 'ollama:response',
    OLLAMA_ERROR: 'ollama:error',
    OLLAMA_STREAM_START: 'ollama:stream-start',
    OLLAMA_STREAM_COMPLETE: 'ollama:stream-complete',
    // A/B testing
    ABTEST_START: 'abtest:start',
    ABTEST_COMPLETE: 'abtest:complete',
    // Scheduled jobs
    JOB_SCHEDULED: 'job:scheduled',
    JOB_EXECUTED: 'job:executed',
    JOB_CANCELLED: 'job:cancelled',
    // Grounding / hallucination check
    GROUND_CHECK_COMPLETE: 'ground-check:complete',
    // Triple validation benchmark
    TRIPLE_VALIDATION_START: 'triple-validation:start',
    TRIPLE_VALIDATION_PROGRESS: 'triple-validation:progress',
    TRIPLE_VALIDATION_COMPLETE: 'triple-validation:complete',
    // Persona auto-suggest
    PERSONA_AUTOSUGGEST_REQUEST: 'persona:autosuggest-request',
    PERSONA_AUTOSUGGEST_KEYWORDS: 'persona:autosuggest-keywords',
    PERSONA_AUTOSUGGEST_SEARCH: 'persona:autosuggest-search',
};
