/**
 * Jest test for client.getMessages()
 * No fetch mocking — hits the real Elasticsearch endpoint.
 * Creates and cleans up real ChatSession records to verify behavior.
 */

import { createClient, config, esEntities as _esEntities } from '../client';
const esEntities = _esEntities as any;
import { modelRouter } from '../lib/model-router';

const EP = 'http://127.0.0.1:11434';

jest.setTimeout(30000);

describe('client.getMessages', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ollama_endpoints', JSON.stringify([EP]));
    modelRouter.invalidateCache();
    localStorage.setItem('model_router_capability_cache', JSON.stringify({ endpoint: EP, map: {}, ts: Date.now() }));
  });

  test('is a function on the client', () => {
    const client = createClient(config);
    expect(typeof client.getMessages).toBe('function');
  });

  test('returns empty array for empty session id', async () => {
    const client = createClient(config);
    const messages = await client.getMessages('');
    expect(messages).toEqual([]);
  });

  test('returns the full messages array for a real session', async () => {
    const client = createClient(config);
    const expectedMessages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello there' },
      { role: 'assistant', content: 'Hi! How can I help?' },
      { role: 'user', content: 'What is the weather?' },
    ];
    const session = await esEntities.ChatSession.create({
      title: 'test-get-messages',
      persona_id: 'test',
      persona_name: 'Test',
      messages: expectedMessages as any,
      message_count: expectedMessages.length,
    });
    try {
      const messages = await client.getMessages(session.id);
      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toHaveLength(expectedMessages.length);
      expect(messages.map((m: any) => ({ role: m.role, content: m.content }))).toEqual(expectedMessages);
    } finally {
      await esEntities.ChatSession.delete(session.id).catch(() => {});
    }
  });

  test('returns empty array when session has no messages field', async () => {
    const client = createClient(config);
    const session = await esEntities.ChatSession.create({
      title: 'test-no-messages',
      persona_id: 'test',
      persona_name: 'Test',
      message_count: 0,
    });
    try {
      const messages = await client.getMessages(session.id);
      expect(messages).toEqual([]);
    } finally {
      await esEntities.ChatSession.delete(session.id).catch(() => {});
    }
  });
});