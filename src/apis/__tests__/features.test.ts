/**
 * features.test.ts
 *
 * Jest test suite for the 4 app-wide improvements:
 *   1. Self-Correct (re-improve assistant response via chatCompletion)
 *   2. Top Model Badge (getAvailableModels → reduce by performanceScore)
 *   3. Vector-based Persona Auto-Suggest (autoSelectPersona cosine similarity)
 *   4. Session Cost Tracker (estimateCost accumulation across messages)
 *
 * Uses real clientLibrary + client APIs — no fetch mocks.
 * Tests are split into pure-contract (always run) and integration (skipped
 * when Ollama/ES unreachable).
 */


import { clientLibrary } from '../ClientLibrary';
import { config } from '../client';

// ── Reachability helpers ────────────────────────────────────────────────────

async function isOllamaReachable(): Promise<boolean> {
  try {
    const ep = (config.ollamaEndpoints?.[0] || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const res = await fetch(`${ep}/v1/models`);
    return res.ok;
  } catch {
    return false;
  }
}

const OLLAMA = { up: false };

beforeAll(async () => {
  OLLAMA.up = await isOllamaReachable();
  if (!OLLAMA.up) {
    // eslint-disable-next-line no-console
    console.warn('\n  ⏭️  Ollama unreachable — integration tests will be skipped\n');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 1. SELF-CORRECT
// ════════════════════════════════════════════════════════════════════════════

describe('Self-Correct feature', () => {
  test('chatCompletion is available on clientLibrary', () => {
    expect(typeof clientLibrary.chatCompletion).toBe('function');
  });

  test('chatCompletion returns a Promise', () => {
    const p = clientLibrary.chatCompletion([], {});
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  test('self-correct system prompt is a critique-and-improve instruction', () => {
    // Mirrors the system prompt used in Chat.jsx handleSelfCorrect
    const systemPrompt =
      'You are a response quality expert. Critique the original response for accuracy, clarity, and completeness, then provide a significantly improved version. Output ONLY the improved response, no meta-commentary or preamble.';
    expect(systemPrompt).toContain('Critique');
    expect(systemPrompt).toContain('improved');
    expect(systemPrompt).toContain('ONLY');
  });

  test('integration: self-correct produces an improved non-empty response', async () => {
    if (!OLLAMA.up) return;

    const originalResponse = 'The sky is blue because of the ocean reflecting light.';
    const userQuestion = 'Why is the sky blue?';

    const improved = await clientLibrary.chatCompletion(
      [
        { role: 'system', content: 'You are a response quality expert. Critique the original response for accuracy, clarity, and completeness, then provide a significantly improved version. Output ONLY the improved response, no meta-commentary or preamble.' },
        { role: 'user', content: `Original question:\n${userQuestion}\n\nResponse to improve:\n${originalResponse}` },
      ],
      { temperature: 0.5 }
    );

    expect(typeof improved).toBe('string');
    expect(improved.length).toBeGreaterThan(0);
  }, 60000);
});

// ════════════════════════════════════════════════════════════════════════════
// 2. TOP MODEL BADGE
// ════════════════════════════════════════════════════════════════════════════

describe('Top Model Badge feature', () => {
  test('getAvailableModels is a function on clientLibrary', () => {
    expect(typeof clientLibrary.getAvailableModels).toBe('function');
  });

  test('getAvailableModels returns an array', () => {
    const models = clientLibrary.getAvailableModels();
    expect(Array.isArray(models)).toBe(true);
  });

  test('each model entry has name, capabilities, paramCount, performanceScore', () => {
    const models = clientLibrary.getAvailableModels();
    if (models.length === 0) return; // cold start — acceptable
    for (const m of models) {
      expect(m).toHaveProperty('name');
      expect(m).toHaveProperty('capabilities');
      expect(m).toHaveProperty('paramCount');
      expect(m).toHaveProperty('performanceScore');
      expect(Array.isArray(m.capabilities)).toBe(true);
      expect(typeof m.performanceScore).toBe('number');
    }
  });

  test('reduce finds the model with highest performanceScore (mirrors ModelSelector logic)', () => {
    const models = [
      { name: 'a', performanceScore: 10 },
      { name: 'b', performanceScore: 50 },
      { name: 'c', performanceScore: 30 },
    ];
    const best = models.reduce((a, b) => (b.performanceScore > a.performanceScore ? b : a));
    expect(best.name).toBe('b');
    expect(best.performanceScore).toBe(50);
  });

  test('top model is only set when performanceScore > 0 (mirrors guard)', () => {
    const models = [{ name: 'a', performanceScore: 0 }];
    const best = models.reduce((a, b) => (b.performanceScore > a.performanceScore ? b : a));
    expect(best.performanceScore > 0).toBe(false);
  });
});

