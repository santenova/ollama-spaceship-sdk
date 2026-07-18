
import { clientLibrary as lib } from './ClientLibrary';

import { ClientLibrary, clientLibrary } from './ClientLibrary';
import { config ,createClient,client} from './client';

function getLib() { return new ClientLibrary(); }

const fallbackModel = "qwen3:0.6b";

const schema = await client.esEntities.Persona.schema();

const mr = client.modelRouter;
if (!mr || typeof mr.resolve !== 'function') throw new Error('client.modelRouter.resolve is not a function');
const routedChat = mr.resolve({ TaskType: 'chat', Speed: 80, defaultModel: fallbackModel });
if (typeof routedChat !== 'string' || !routedChat) throw new Error(`modelRouter.resolve(chat) returned "${routedChat}"`);
console.log(`  modelRouter(chat, speed=80)  → "${routedChat}"`);
const routedJson = mr.resolve({ TaskType: 'json', Speed: 50, defaultModel: fallbackModel });
if (typeof routedJson !== 'string' || !routedJson) throw new Error(`modelRouter.resolve(json) returned "${routedJson}"`);



// ── Generic wrapper: registers an abort controller with abortManager for any
//    integration call, passes the signal to the callback, and cleans up.
let _abortCounter = 0;
async function withAbort(client: any, label: string, fn: (signal: AbortSignal) => Promise<any>): Promise<any> {
  const key = `test-${label}-${++_abortCounter}`;
  client.clientLogger.info(`${label} start`, { key });
  const controller = client.abortManager.create(key);
  try {
    return await client.clientLogger.timed(label, () => fn(controller.signal), { key });
  } finally {
    client.abortManager.cancel(key);
  }
}

const batchModels = [routedChat, routedChat, routedJson];
const batchPrompts = [
  `Write a one-sentence caption for it`,
  `Write a haiku inspired by it`,
  `Return a JSON object: {"mood": "<word>", "setting": "<word>"} based on it`,
];

const [br1, br2, br3] = await Promise.all(batchModels.map((m, i) =>
  withAbort(client, 'InvokeLLMBatched', (signal) =>
    client.integrations.Core.InvokeLLMBatched({
      model: m,
      system: 'You are a creative assistant.',
      prompt: batchPrompts[i],
      signal,
    })
  )
));
const batchReplies = [br1, br2, br3].map(r => typeof r === 'string' ? r : JSON.stringify(r));
batchReplies.forEach((txt, i) => {
  console.log(`  batch[${i}] (model: "${batchModels[i]}") → ${txt.slice(0, 60)}${txt.length > 60 ? '...' : ''}`);
});
const batchedOk = batchReplies.some(t => t.length > 0);
if (!batchedOk) console.log('InvokeLLMBatched returned all empty');



const beam = await lib.beam('What is AI?', { taskType: 'chat', concurrency: 1});
beam.results.forEach(r => console.log(r.model, r.status, r.response));

// Search & Tools
