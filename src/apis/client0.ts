import { clientLibrary as lib } from './ClientLibrary';
import { client, config } from './client';


async function downloadFile(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], 'my-image.png');
}

// LLM
const text = await lib.invoke({ prompt: 'Hello' });
const json = await lib.invoke({
  prompt: 'Parse this',
  response_json_schema: {
    type: 'object',
    properties: {
      result: {
        type: 'string'
      },
      error: {
        type: 'boolean'
      }
    }
  }
});


console.log(json);

// Streaming
lib.stream('code', 'Wise it up to a story!', { trackProgress: true }).subscribe({
  next: (chunk) => process.stdout.write(chunk.text),
  error: console.error,
  complete: (summary) => console.log(`\n${summary.tokensPerSecond} tok/s`),
});
