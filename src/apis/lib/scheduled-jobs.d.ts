/**
 * Scheduled / Async LLM Jobs
 *
 * Persists job definitions to ES and drives polling-based execution.
 * All LLM calls use OpenAI-API-style /v1/chat/completions.
 */
export interface ScheduledJob {
    id?: string;
    name: string;
    prompt: string;
    cronExpression: string;
    outputEntity: string;
    model?: string;
    system?: string;
    status: 'active' | 'paused' | 'completed' | 'error';
    lastRunAt?: string;
    nextRunAt?: string;
    created_date?: string;
    updated_date?: string;
    runCount?: number;
    lastError?: string;
}
export interface JobOutput {
    id?: string;
    job_id: string;
    job_name: string;
    prompt: string;
    response: string;
    model: string;
    output_entity: string;
    executed_at: string;
    duration_ms: number;
}
/**
 * Minimal cron parser. Fields: minute hour day-of-month month day-of-week.
 * Supports wildcard, step-values (every-n), and exact values.
 */
export declare function nextCronDate(expression: string, from?: Date): Date;
export declare function scheduleJob(jobDef: Omit<ScheduledJob, 'id' | 'status' | 'created_date' | 'updated_date' | 'nextRunAt' | 'runCount'>, ollamaEndpoints: string[], defaultModel: string): Promise<ScheduledJob>;
export declare function runJob(job: ScheduledJob, ollamaEndpoints: string[], defaultModel: string): Promise<JobOutput>;
export declare function runDueJobs(ollamaEndpoints: string[], defaultModel: string): Promise<JobOutput[]>;
export declare function setJobStatus(jobId: string, status: 'active' | 'paused'): Promise<void>;
export declare function cancelJob(jobId: string): Promise<void>;
export declare function listJobs(status?: ScheduledJob['status']): Promise<ScheduledJob[]>;
