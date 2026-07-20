#!/usr/bin/env tsx
/**
 * CLI runner for the Triple Validation Benchmark.
 *
 * Usage:
 *   npx tsx src/apis/lib/triple-validation-cli.ts [--cases <n>] [--models <n>]
 *
 * Options:
 *   --cases <n>    Number of test cases to benchmark (default: 50)
 *   --models <n>   Limit to first <n> models (0 = all, default: 0)
 *
 * Environment overrides:
 *   OLLAMA_ENDPOINT   Ollama base URL (default: http://127.0.0.1:11434)
 *   OLLAMA_MODEL      Fallback model when /v1/models is unreachable (default: llama3.2)
 *   ES_ENDPOINT       Elasticsearch URL (default: http://127.0.0.1:9200)
 */

import { tripleValidation } from './triple-validation';
import { endpointRegistry } from './endpoint-registry';
import { telemetry } from './telemetry';
import { TelemetryEvents } from './telemetry-events';

// ─── ANSI helpers ────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Foreground
  black: '\x1b[30m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
  gray: '\x1b[90m', brightRed: '\x1b[91m', brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m', brightBlue: '\x1b[94m', brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  // Background
  bgBlack: '\x1b[40m', bgRed: '\x1b[41m', bgGreen: '\x1b[42m', bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m', bgMagenta: '\x1b[45m', bgCyan: '\x1b[46m', bgWhite: '\x1b[47m',
};
const color = (code: string, text: string) => `${code}${text}${C.reset}`;
const pad = (s: string | number, n: number, align: 'left' | 'right' = 'left') =>
  align === 'left' ? String(s).padEnd(n) : String(s).padStart(n);

function accuracyColor(acc: number): string {
  if (acc >= 0.9) return C.brightGreen;
  if (acc >= 0.75) return C.brightYellow;
  if (acc >= 0.5) return C.brightRed;
  return C.gray;
}

function progressBar(pct: number, width = 30): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return `${C.bgBlue}${' '.repeat(filled)}${C.reset}${C.gray}${'·'.repeat(empty)}${C.reset}`;
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIdx = 0;
function spinnerFrame(): string {
  const f = SPINNER[spinnerIdx % SPINNER.length];
  spinnerIdx++;
  return f;
}

// ─── Box drawing ─────────────────────────────────────────────────────────────
function box(title: string, lines: string[]): string {
  const all = [title, ...lines];
  const w = Math.max(...all.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').length)) + 4;
  const top = `${color(C.cyan, '╭' + '─'.repeat(w + 2) + '╮')}`;
  const bot = `${color(C.cyan, '╰' + '─'.repeat(w + 2) + '╯')}`;
  const mid = (text: string) => {
    const visible = text.replace(/\x1b\[[0-9;]*m/g, '');
    const padLen = w - visible.length;
    return `${color(C.cyan, '│')} ${text}${' '.repeat(padLen)} ${color(C.cyan, '│')}`;
  };
  return [top, mid(color(C.bold + C.brightCyan, title)), mid(color(C.cyan, '─'.repeat(w))), ...lines.map(mid), bot].join('\n');
}

// ─── Args ────────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): { caseLimit: number; modelLimit: number } {
  const args = { caseLimit: 50, modelLimit: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cases' && argv[i + 1]) {
      args.caseLimit = parseInt(argv[++i], 10) || 50;
    } else if (argv[i] === '--models' && argv[i + 1]) {
      args.modelLimit = parseInt(argv[++i], 10) || 0;
    }
  }
  return args;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const { caseLimit, modelLimit } = parseArgs(process.argv.slice(2));

  // Allow env-var overrides for headless runs (no localStorage in Node).
  if (process.env.OLLAMA_ENDPOINT) {
    endpointRegistry.update({ ollama: [process.env.OLLAMA_ENDPOINT] });
  }
  if (process.env.ES_ENDPOINT) {
    endpointRegistry.update({ elasticsearch: process.env.ES_ENDPOINT });
  }

  const endpoints = [endpointRegistry.ollama()];
  const defaultModel = process.env.OLLAMA_MODEL || 'llama3.2';

  // Fancy header
  console.log();
  console.log(box('🧪 Triple Validation Benchmark', [
    `${color(C.brightBlue, 'Cases')}   ${color(C.bold, String(caseLimit))}`,
    `${color(C.brightBlue, 'Models')}  ${color(C.bold, modelLimit === 0 ? 'all' : String(modelLimit))}`,
    `${color(C.brightBlue, 'Ollama')}  ${color(C.gray, endpoints[0])}`,
    `${color(C.brightBlue, 'ES')}      ${color(C.gray, endpointRegistry.elasticsearch())}`,
  ]));
  console.log();

  // ASCII agenda — benchmark phases at a glance
  const agenda = [
    `${color(C.brightCyan, '1.')} ${color(C.bold, 'Discover')}   ${color(C.gray, '—')} List models from Ollama /v1/models`,
    `${color(C.brightCyan, '2.')} ${color(C.bold, 'Load')}       ${color(C.gray, '—')} Fetch test cases from Elasticsearch`,
    `${color(C.brightCyan, '3.')} ${color(C.bold, 'Validate')}   ${color(C.gray, '—')} Run True/False prompt per model×case`,
    `${color(C.brightCyan, '4.')} ${color(C.bold, 'Score')}       ${color(C.gray, '—')} Tally correct / FP / FN / errors`,
    `${color(C.brightCyan, '5.')} ${color(C.bold, 'Persist')}     ${color(C.gray, '—')} Store TestResult docs + drift`,
    `${color(C.brightCyan, '6.')} ${color(C.bold, 'Rank')}       ${color(C.gray, '—')} Sort by accuracy, print table`,
  ];
  const agendaW = 52;
  console.log(color(C.cyan, '╭' + '─'.repeat(agendaW + 2) + '╮'));
  console.log(color(C.cyan, '│') + ' ' + color(C.bold + C.brightMagenta, '📋 Agenda') + ' '.repeat(agendaW - 8) + ' ' + color(C.cyan, '│'));
  console.log(color(C.cyan, '│') + ' ' + color(C.cyan, '─'.repeat(agendaW)) + ' ' + color(C.cyan, '│'));
  for (const line of agenda) {
    const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
    console.log(color(C.cyan, '│') + ' ' + line + ' '.repeat(Math.max(0, agendaW - visible.length)) + ' ' + color(C.cyan, '│'));
  }
  console.log(color(C.cyan, '╰' + '─'.repeat(agendaW + 2) + '╯'));
  console.log();

  // Live progress — mirrors the config panel's telemetry subscription.
  let lastLineLen = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;
  const unsubscribe = telemetry.on(TelemetryEvents.TRIPLE_VALIDATION_PROGRESS, (data) => {
    const globalPct = data.globalTotal ? Math.round((data.globalDone / data.globalTotal) * 100) : 0;
    const modelPct = data.total ? Math.round((data.done / data.total) * 100) : 0;
    const bar = progressBar(modelPct, 20);
    const spinner = color(C.brightMagenta, spinnerFrame());
    const line = `\r  ${spinner} ${bar} ${color(C.bold, globalPct + '%')} ${color(C.dim, '—')} ${color(C.brightCyan, data.model)} ${color(C.gray, `(${data.done}/${data.total})`)}`;
    process.stdout.write('\r' + ' '.repeat(lastLineLen) + '\r');
    process.stdout.write(line);
    lastLineLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
  });

  // Blink the spinner while waiting for the first telemetry event.
  spinnerTimer = setInterval(() => {
    if (lastLineLen === 0) {
      const s = color(C.brightMagenta, spinnerFrame());
      const line = `\r  ${s} ${color(C.dim, 'Initializing benchmark...')}`;
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      process.stdout.write(line);
    }
  }, 80);

  const startTime = Date.now();
  let report;
  try {
    report = await tripleValidation(endpoints, defaultModel, {
      caseLimit,
      modelLimit,
      includePerCase: false,
    });
  } finally {
    if (spinnerTimer) clearInterval(spinnerTimer);
    unsubscribe();
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ─── Results table ──────────────────────────────────────────────────────────
  const sorted = [...report.models].sort((a, b) => b.accuracy - a.accuracy);

  // Header
  console.log(color(C.bold + C.cyan, '┌' + '─'.repeat(120) + '┐'));
  console.log(
    color(C.cyan, '│') +
    `  ${color(C.bold, '🏆 Benchmark Complete')}` +
    color(C.gray, `  ${report.models.length} models · ${report.testCaseCount} test cases · ${elapsed}s`) +
    ' '.repeat(Math.max(0, 120 - 51 - String(report.models.length).length - String(report.testCaseCount).length - elapsed.length)) +
    color(C.cyan, '│'),
  );
  console.log(
    color(C.cyan, '│') +
    `  ${color(C.brightGreen, `✓ Valid: ${report.validCount}`)}   ${color(C.brightRed, `✗ Invalid: ${report.invalidCount}`)}   ${color(C.brightBlue, `⏱ ${elapsed}s`)}` +
    ' '.repeat(60) +
    color(C.cyan, '│'),
  );
  console.log(color(C.bold + C.cyan, '├' + '─'.repeat(120) + '┤'));

  // Column headers
  const headerRow =
    `  ${pad('#', 3, 'right')}  ${pad('Model', 30)}  ${pad('Endpoint', 26)}  ${pad('Acc', 7, 'right')}  ${pad('✓', 5, 'right')}  ${pad('✗', 5, 'right')}  ${pad('FP', 4, 'right')}  ${pad('FN', 4, 'right')}  ${pad('Err', 4, 'right')}  ${pad('Tokens', 8, 'right')}  ${pad('ms/q', 6, 'right')}  ${pad('Perf', 6, 'right')}`;
  console.log(color(C.bold + C.brightCyan, headerRow));
  console.log(color(C.cyan, '│') + color(C.gray, '─'.repeat(120)) + color(C.cyan, '│'));

  // Rows
  const medals = [color(C.brightYellow, '🥇'), color(C.gray, '🥈'), color(C.yellow, '🥉')];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const pct = (s.accuracy * 100).toFixed(1) + '%';
    const msPerQ = s.total ? (s.durationMs / s.total).toFixed(0) : '0';
    const queriesPerSec = s.durationMs > 0 ? (s.total / (s.durationMs / 1000)) : 0;
    const perfScore = (s.accuracy * 70 + Math.min(queriesPerSec, 10) * 3).toFixed(1);

    const rank = medals[i] || color(C.gray, ` ${i + 1}.`);
    const accCol = color(accuracyColor(s.accuracy), pct.padStart(7));
    const errCol = s.errors > 0 ? color(C.brightRed, String(s.errors).padStart(4)) : color(C.dim, String(s.errors).padStart(4));
    const modelCol = i < 3 ? color(C.bold, pad(s.model, 30)) : color(C.white, pad(s.model, 30));
    const endpointCol = color(C.dim, pad(s.endpoint || '-', 26));

    const row =
      `  ${rank}  ${modelCol}  ${endpointCol}  ${accCol}  ${color(C.brightGreen, String(s.correct).padStart(5))}  ${color(C.brightRed, String(s.wrong).padStart(5))}  ${color(C.yellow, String(s.falsePositives).padStart(4))}  ${color(C.magenta, String(s.falseNegatives).padStart(4))}  ${errCol}  ${color(C.blue, String(s.totalTokens).padStart(8))}  ${color(C.cyan, msPerQ.padStart(6))}  ${color(C.brightCyan, perfScore.padStart(6))}`;
    console.log(color(C.cyan, '│') + row);
  }
  console.log(color(C.bold + C.cyan, '├' + '─'.repeat(120) + '┤'));

  // ─── Summary footer ────────────────────────────────────────────────────────
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const avgAcc = sorted.reduce((sum, s) => sum + s.accuracy, 0) / (sorted.length || 1);
  const totalTokens = sorted.reduce((sum, s) => sum + s.totalTokens, 0);
  const totalCorrect = sorted.reduce((sum, s) => sum + s.correct, 0);
  const totalWrong = sorted.reduce((sum, s) => sum + s.wrong, 0);

  const summaryLines = [
    `${color(C.bold, 'Summary')}`,
    `${medals[0]} ${color(C.brightGreen, 'Best')}   ${color(C.bold, best.model)}  ${color(accuracyColor(best.accuracy), (best.accuracy * 100).toFixed(1) + '%')}`,
    `${color(C.gray, '🪣 Worst')}  ${color(C.white, worst.model)}  ${color(accuracyColor(worst.accuracy), (worst.accuracy * 100).toFixed(1) + '%')}`,
    `${color(C.brightBlue, '📊 Avg')}    ${color(C.bold, (avgAcc * 100).toFixed(1) + '%')} accuracy across ${sorted.length} models`,
    `${color(C.brightBlue, '🔢 Tot')}   ${color(C.brightGreen, String(totalCorrect))} correct / ${color(C.brightRed, String(totalWrong))} wrong / ${color(C.blue, totalTokens.toLocaleString())} tokens`,
  ];
  for (const line of summaryLines) {
    console.log(color(C.cyan, '│') + '  ' + line);
  }
  console.log(color(C.bold + C.cyan, '└' + '─'.repeat(120) + '┘'));
  console.log();

  process.exit(0);
}

main().catch((err) => {
  console.error('\n' + color(C.bgRed + C.bold, ' ❌ Benchmark failed '));
  console.error(color(C.brightRed, '   ' + (err?.message ?? err)));
  if (err?.stack) {
    console.error(color(C.dim, '   ' + err.stack));
  }
  console.error();
  process.exit(1);
});
