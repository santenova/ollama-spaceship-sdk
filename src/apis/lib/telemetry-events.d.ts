/**
 * Telemetry event catalogue (#5)
 * Single source of truth for all event names. Import `TelemetryEvents`
 * to reference event names without relying on raw string literals.
 */
export declare const TelemetryEvents: {
    readonly REQUEST_START: "client:request-start";
    readonly REQUEST_END: "client:request-end";
    readonly FALLBACK_TRIGGERED: "client:fallback-triggered";
    readonly CIRCUIT_OPEN: "client:circuit-open";
    readonly CIRCUIT_CLOSED: "client:circuit-closed";
    readonly MODEL_ROUTED: "client:model-routed";
    readonly VECTOR_INDEX_CREATED: "client:vector-index-created";
    readonly LIMITS_UPDATED: "client:limits-updated";
    readonly EXPAND_QUERY: "client:expand-query";
    readonly ERROR: "client:error";
    readonly PAGE_VIEW: "app:page-view";
    readonly NAV_CLICK: "app:nav-click";
    readonly APP_ACTION: "app:action";
    readonly OLLAMA_REQUEST: "ollama:request";
    readonly OLLAMA_RESPONSE: "ollama:response";
    readonly OLLAMA_ERROR: "ollama:error";
    readonly OLLAMA_STREAM_START: "ollama:stream-start";
    readonly OLLAMA_STREAM_COMPLETE: "ollama:stream-complete";
    readonly ABTEST_START: "abtest:start";
    readonly ABTEST_COMPLETE: "abtest:complete";
    readonly JOB_SCHEDULED: "job:scheduled";
    readonly JOB_EXECUTED: "job:executed";
    readonly JOB_CANCELLED: "job:cancelled";
    readonly GROUND_CHECK_COMPLETE: "ground-check:complete";
    readonly TRIPLE_VALIDATION_START: "triple-validation:start";
    readonly TRIPLE_VALIDATION_PROGRESS: "triple-validation:progress";
    readonly TRIPLE_VALIDATION_COMPLETE: "triple-validation:complete";
    readonly PERSONA_AUTOSUGGEST_REQUEST: "persona:autosuggest-request";
    readonly PERSONA_AUTOSUGGEST_KEYWORDS: "persona:autosuggest-keywords";
    readonly PERSONA_AUTOSUGGEST_SEARCH: "persona:autosuggest-search";
};
export type TelemetryEvent = typeof TelemetryEvents[keyof typeof TelemetryEvents];
