/**
 * Scheduled / Async LLM Jobs
 *
 * Persists job definitions to ES and drives polling-based execution.
 * All LLM calls use OpenAI-API-style /v1/chat/completions.
 */

import { chatCompletion } from './openai-fetch';
import { getEsConfig, ensureEsIndex } from './es-entities';
import { telemetry } from './telemetry';

const JOBS_INDEX = 'sample-prompt-scheduled-jobs';

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
export function nextCronDate(expression: string, from = new Date()): Date {
  const [minF, hourF, domF, monF, dowF] = expression.trim().split(/\s+/);

  const matches = (field: string, value: number): boolean => {
    if (field === '*') return true;
    if (field.startsWith('*/')) return value % parseInt(field.slice(2), 10) === 0;
    return parseInt(field, 10) === value;
  };

  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  const limit = new Date(from);
  limit.setFullYear(limit.getFullYear() + 1);

  while (next < limit) {
    if (
      matches(monF, next.getMonth() + 1) &&
      matches(domF, next.getDate()) &&
      matches(dowF, next.getDay()) &&
      matches(hourF, next.getHours()) &&
      matches(minF, next.getMinutes())
    ) return next;
    next.setMinutes(next.getMinutes() + 1);
  }
  return next;
}

async function ensureJobsIndex(endpoint: string): Promise<void> {
  await ensureEsIndex(endpoint, JOBS_INDEX, {
    mappings: {
      properties: {
        status:       { type: 'keyword' },
        outputEntity: { type: 'keyword' },
        nextRunAt:    { type: 'date' },
        lastRunAt:    { type: 'date' },
        created_date: { type: 'date' },
        updated_date: { type: 'date' },
      },
    },
  });
}

export async function scheduleJob(
  jobDef: Omit<ScheduledJob, 'id' | 'status' | 'created_date' | 'updated_date' | 'nextRunAt' | 'runCount'>,
  ollamaEndpoints: string[],
  defaultModel: string,
): Promise<ScheduledJob> {
  const cfg = getEsConfig();
  await ensureJobsIndex(cfg.endpoint);

  const now = new Date();
  const job: ScheduledJob = {
    ...jobDef,
    model: jobDef.model || defaultModel,
    status: 'active',
    nextRunAt: nextCronDate(jobDef.cronExpression, now).toISOString(),
    runCount: 0,
    created_date: now.toISOString(),
    updated_date: now.toISOString(),
  };

  const res = await fetch(`${cfg.endpoint}/${JOBS_INDEX}/_doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  });
  const data: any = await res.json();
  job.id = data._id;

  telemetry.emit('job:scheduled', { name: job.name, cron: job.cronExpression });
  return job;
}

export async function runJob(
  job: ScheduledJob,
  ollamaEndpoints: string[],
  defaultModel: string,
): Promise<JobOutput> {
  const cfg = getEsConfig();
  const start = Date.now();
  const model = job.model || defaultModel;
  let response = '';
  let errorMsg: string | undefined;

  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (job.system) messages.push({ role: 'system', content: job.system });
    messages.push({ role: 'user', content: job.prompt });
    const result = await chatCompletion(ollamaEndpoints, model, messages);
    response = typeof result === 'string' ? result : JSON.stringify(result);
  } catch (err: any) {
    errorMsg = err?.message ?? String(err);
  }

  const executedAt = new Date().toISOString();
  const durationMs = Date.now() - start;
  const output: JobOutput = {
    job_id: job.id!,
    job_name: job.name,
    prompt: job.prompt,
    response,
    model,
    output_entity: job.outputEntity,
    executed_at: executedAt,
    duration_ms: durationMs,
  };

  try {
    const outputIndex = `sample-prompt-${job.outputEntity.toLowerCase().replace(/\s+/g, '-')}`;
    const outRes = await fetch(`${cfg.endpoint}/${outputIndex}/_doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...output, created_date: executedAt }),
    });
    const outData: any = await outRes.json();
    output.id = outData._id;
  } catch {}

  if (job.id) {
    await fetch(`${cfg.endpoint}/${JOBS_INDEX}/_update/${job.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc: {
          lastRunAt: executedAt,
          nextRunAt: nextCronDate(job.cronExpression, new Date()).toISOString(),
          updated_date: executedAt,
          runCount: (job.runCount || 0) + 1,
          status: errorMsg ? 'error' : 'active',
          ...(errorMsg ? { lastError: errorMsg } : {}),
        },
      }),
    });
  }

  telemetry.emit('job:executed', { name: job.name, durationMs, hasError: !!errorMsg });
  return output;
}

export async function runDueJobs(ollamaEndpoints: string[], defaultModel: string): Promise<JobOutput[]> {
  const cfg = getEsConfig();
  let jobs: ScheduledJob[] = [];

  try {
    const res = await fetch(`${cfg.endpoint}/${JOBS_INDEX}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: { bool: { must: [{ term: { status: 'active' } }, { range: { nextRunAt: { lte: new Date().toISOString() } } }] } },
        size: 50,
      }),
    });
    if (res.ok) {
      const data: any = await res.json();
      jobs = (data.hits?.hits || []).map((h: any) => ({ id: h._id, ...h._source }));
    }
  } catch {}

  if (jobs.length === 0) return [];
  const results = await Promise.allSettled(jobs.map(job => runJob(job, ollamaEndpoints, defaultModel)));
  return results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<JobOutput>).value);
}

export async function setJobStatus(jobId: string, status: 'active' | 'paused'): Promise<void> {
  const cfg = getEsConfig();
  await fetch(`${cfg.endpoint}/${JOBS_INDEX}/_update/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc: { status, updated_date: new Date().toISOString() } }),
  });
}

export async function cancelJob(jobId: string): Promise<void> {
  const cfg = getEsConfig();
  await fetch(`${cfg.endpoint}/${JOBS_INDEX}/_doc/${jobId}`, { method: 'DELETE' });
  telemetry.emit('job:cancelled', { jobId });
}

export async function listJobs(status?: ScheduledJob['status']): Promise<ScheduledJob[]> {
  const cfg = getEsConfig();
  const query = status ? { term: { status } } : { match_all: {} };
  try {
    const res = await fetch(`${cfg.endpoint}/${JOBS_INDEX}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, sort: [{ nextRunAt: { order: 'asc' } }], size: 100 }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.hits?.hits || []).map((h: any) => ({ id: h._id, ...h._source }));
  } catch {
    return [];
  }
}