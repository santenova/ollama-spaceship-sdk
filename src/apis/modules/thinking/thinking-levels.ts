interface ThinkingLevelsConfig {
  ollamaEndpoints: string[];
  model?: string | null;
  defaultModel?: string;
}

function printHeading(text: string) {
  console.log(text);
  console.log('='.repeat(text.length));
}

/**
 * Thinking levels — iterates over low/medium/high thinking levels using
 * Ollama's OpenAI-compatible /v1/chat/completions endpoint.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below uses
 * plain `fetch` so it works in both browser and Node.
 */
export async function thinkingLevels(
  prompt: string,
  config: ThinkingLevelsConfig,
) {
  const host =
    config.ollamaEndpoints[1] ||
    config.ollamaEndpoints[0] ||
    'http://localhost:11434';
  const useModel =
    config.model || config.defaultModel || 'qwen3:0.6b';

  const messages = [{ role: 'user', content: prompt || 'What is 10 + 23?' }];

  // gpt-oss supports 'low', 'medium', 'high'
  const levels = ['low', 'medium', 'high'] as const;

  for (const [index, level] of levels.entries()) {
    const res = await fetch(`${host}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: useModel,
        messages,
        stream: true,
        think: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`thinkingLevels (${level}) error: ${res.status}: ${await res.text().catch(() => '')}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let thinkBuf = '';
    let contentBuf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        const trimmed = line.replace(/^data:\s*/, '').trim();
        if (!trimmed || trimmed === '[DONE]') continue;
        try {
          const json = JSON.parse(trimmed);
          const delta = json?.choices?.[0]?.delta;
          if (delta?.thinking) thinkBuf += delta.thinking;
          if (delta?.content) contentBuf += delta.content;
        } catch {
          // partial JSON across chunk boundaries — skip
        }
      }
    }

    printHeading(`Thinking (${level})`);
    console.log(thinkBuf);
    console.log('\n');

    printHeading('Response');
    console.log(contentBuf);
    console.log('\n');

    if (index < levels.length - 1) {
      console.log('-'.repeat(20));
      console.log('\n');
    }
  }
}
