/**
 * Structural / contract tests for ClientLibrary.ts
 *
 * No mocks. Tests verify:
 *   - The class and singleton are correctly exported
 *   - Every public method exists and has the right type
 *   - Infrastructure accessors return defined objects with the right shape
 *   - Config round-trips work (updateConfig → getConfig)
 *   - Rate-limit round-trips work (setLimits → getLimits)
 *   - Entity proxy is accessible and has expected entity namespaces
 */

import { ClientLibrary, clientLibrary } from '../ClientLibrary';

function getLib() { return new ClientLibrary(); }

// ─────────────────────────────────────────────────────────────────────────────
// 1. Construction & singleton
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — construction & singleton', () => {
  test('can be instantiated', () => {
    expect(getLib()).toBeInstanceOf(ClientLibrary);
  });

  test('clientLibrary is a ClientLibrary instance', () => {
    expect(clientLibrary).toBeInstanceOf(ClientLibrary);
  });

  test('two instances share the same underlying raw client', () => {
    expect(getLib().raw).toBe(getLib().raw);
  });

  test('raw is defined', () => {
    expect(getLib().raw).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Method existence — LLM
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — method contracts: LLM', () => {
  test('invoke is a function', () => {
    expect(typeof getLib().invoke).toBe('function');
  });

  test('invokeBatched is a function', () => {
    expect(typeof getLib().invokeBatched).toBe('function');
  });

  test('invoke returns a Promise', () => {
    // Use a non-empty prompt so validation passes and we get a real Promise back
    const result = getLib().invoke({ prompt: 'hello' });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {}); // suppress unhandled rejection
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Method existence — Streaming
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — method contracts: stream', () => {
  test('stream is a function', () => {
    expect(typeof getLib().stream).toBe('function');
  });

  test('stream returns an object with a subscribe function', () => {
    const result = getLib().stream('chat', 'hello');
    expect(result).toBeDefined();
    expect(typeof result.subscribe).toBe('function');
  });

  test.each(['chat', 'vision', 'code', 'audio', 'thinking'] as const)(
    'stream accepts task type "%s"',
    (task) => {
      const result = getLib().stream(task, 'input');
      expect(typeof result.subscribe).toBe('function');
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Method existence — Vision
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — method contracts: vision', () => {
  test('encodeImage is a function', () => {
    expect(typeof getLib().encodeImage).toBe('function');
  });

  test('visionSend is a function', () => {
    expect(typeof getLib().visionSend).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Method existence — Vector
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — method contracts: vector', () => {
  test('vector is a function', () => {
    expect(typeof getLib().vector).toBe('function');
  });

  test('vectorIndex is a function', () => {
    expect(typeof getLib().vectorIndex).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Method existence — Beaming
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — method contracts: beam', () => {
  test('beam is a function', () => {
    expect(typeof getLib().beam).toBe('function');
  });

  test('beam returns a Promise', () => {
    const p = getLib().beam('hello', {});
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Method existence — expandQuery & solution
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — method contracts: expandQuery & solution', () => {
  test('expandQuery is a function', () => {
    expect(typeof getLib().expandQuery).toBe('function');
  });

  test('solution is a function', () => {
    expect(typeof getLib().solution).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Method existence — websearch & toolbox
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — method contracts: websearch & toolbox', () => {
  test('websearch is a function', () => {
    expect(typeof getLib().websearch).toBe('function');
  });

  test('toolbox is a function', () => {
    expect(typeof getLib().toolbox).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Method existence — thinking
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — method contracts: thinking', () => {
  test('thinking is a function', () => {
    expect(typeof getLib().thinking).toBe('function');
  });

  test('thinkingEnabled is a function', () => {
    expect(typeof getLib().thinkingEnabled).toBe('function');
  });

  test('thinkingLevels is a function', () => {
    expect(typeof getLib().thinkingLevels).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Method existence — getMessages
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — method contracts: getMessages', () => {
  test('getMessages is a function', () => {
    expect(typeof getLib().getMessages).toBe('function');
  });

  test('getMessages returns a Promise', () => {
    const p = getLib().getMessages('');
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Config management round-trips
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — config management', () => {
  test('getConfig returns an object with model and ollamaEndpoints', () => {
    const cfg = getLib().getConfig();
    expect(cfg).toBeDefined();
    expect(typeof cfg).toBe('object');
    expect(cfg).toHaveProperty('model');
    expect(cfg).toHaveProperty('ollamaEndpoints');
  });

  test('updateConfig and getConfig round-trip model', () => {
    const lib = getLib();
    const original = lib.getConfig().model;
    lib.updateConfig({ model: '__test_model__' });
    expect(lib.getConfig().model).toBe('__test_model__');
    // restore
    lib.updateConfig({ model: original });
  });

  test('updateConfig and getConfig round-trip ollamaEndpoints', () => {
    const lib = getLib();
    const original = lib.getConfig().ollamaEndpoints;
    lib.updateConfig({ ollamaEndpoints: ['http://test-host:11434'] });
    expect(lib.getConfig().ollamaEndpoints).toEqual(['http://test-host:11434']);
    lib.updateConfig({ ollamaEndpoints: original });
  });

  test('getEsConfig returns an object with endpoint and indices', () => {
    const cfg = getLib().getEsConfig();
    expect(cfg).toHaveProperty('endpoint');
    expect(cfg).toHaveProperty('indices');
  });

  test('saveEsConfig is a function', () => {
    expect(typeof getLib().saveEsConfig).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Rate limiting round-trips
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — rate limiting', () => {
  test('getLimits returns null initially (unlimited)', () => {
    // The client is initialised with rateLimit: null
    expect(getLib().getLimits()).toBeNull();
  });

  test('setLimits and getLimits round-trip', () => {
    const lib = getLib();
    lib.setLimits({ maxCalls: 7, windowMs: 2000 });
    const limits = lib.getLimits();
    expect(limits).toEqual({ maxCalls: 7, windowMs: 2000 });
    // restore
    lib.setLimits(null);
  });

  test('setLimits(null) resets to unlimited', () => {
    const lib = getLib();
    lib.setLimits({ maxCalls: 5, windowMs: 1000 });
    lib.setLimits(null);
    expect(lib.getLimits()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Infrastructure accessors — shape checks
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — infrastructure accessors', () => {
  test('circuitBreaker is defined and has canCall', () => {
    const cb = getLib().circuitBreaker;
    expect(cb).toBeDefined();
    expect(typeof cb.canCall).toBe('function');
  });

  test('abortManager is defined and has create/cancel/cancelAll', () => {
    const am = getLib().abortManager;
    expect(typeof am.create).toBe('function');
    expect(typeof am.cancel).toBe('function');
    expect(typeof am.cancelAll).toBe('function');
  });

  test('logger is defined and has info/warn/error/timed', () => {
    const log = getLib().logger;
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.timed).toBe('function');
  });

  test('telemetry is defined and has on/emit', () => {
    const tel = getLib().telemetry;
    expect(typeof tel.on).toBe('function');
    expect(typeof tel.emit).toBe('function');
  });

  test('toolRegistry is defined and has register/has/call/list', () => {
    const reg = getLib().toolRegistry;
    expect(typeof reg.register).toBe('function');
    expect(typeof reg.has).toBe('function');
    expect(typeof reg.call).toBe('function');
    expect(typeof reg.list).toBe('function');
  });

  test('modelRouter is defined and has resolve/resolveAll', () => {
    const mr = getLib().modelRouter;
    expect(typeof mr.resolve).toBe('function');
    expect(typeof mr.resolveAll).toBe('function');
  });

  test('promptRouter is defined and has enhance', () => {
    const pr = getLib().promptRouter;
    expect(typeof pr.enhance).toBe('function');
  });

  test('authMiddleware is defined and has injectAuthHeaders', () => {
    const am = getLib().authMiddleware;
    expect(typeof am.injectAuthHeaders).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Entity & ES endpoint accessors
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — entities & esEndpoint', () => {
  test('entities is defined', () => {
    expect(getLib().entities).toBeDefined();
  });

  test('entities.Persona exposes list/filter/get', () => {
    const lib = getLib();
    expect(typeof lib.entities.Persona.list).toBe('function');
    expect(typeof lib.entities.Persona.filter).toBe('function');
    expect(typeof lib.entities.Persona.get).toBe('function');
  });

  test('esEndpoint is a non-empty string', () => {
    const ep = getLib().esEndpoint;
    expect(typeof ep).toBe('string');
    expect(ep.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. toolRegistry — built-in tools are pre-registered
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — toolRegistry built-ins', () => {
  test('InvokeLLM is registered', () => {
    expect(getLib().toolRegistry.has('InvokeLLM')).toBe(true);
  });

  test('websearch is registered', () => {
    expect(getLib().toolRegistry.has('websearch')).toBe(true);
  });

  test('toolbox is registered', () => {
    expect(getLib().toolRegistry.has('toolbox')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Cost Estimator
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — cost estimator', () => {
  test('estimateCost is a function', () => {
    expect(typeof getLib().estimateCost).toBe('function');
  });

  test('estimateCost returns a CostEstimate with all required fields', () => {
    const est = getLib().estimateCost('Hello world', 'llama3:8b');
    expect(est).toHaveProperty('model');
    expect(est).toHaveProperty('inputTokens');
    expect(est).toHaveProperty('outputTokens');
    expect(est).toHaveProperty('estimatedUSD');
    expect(est).toHaveProperty('pricing');
    expect(est.inputTokens).toBeGreaterThan(0);
    expect(est.estimatedUSD).toBeGreaterThanOrEqual(0);
  });

  test('estimateCost inputTokens scales with prompt length', () => {
    const short = getLib().estimateCost('Hi', 'llama3:8b');
    const long  = getLib().estimateCost('Hello world, this is a much longer prompt sentence.', 'llama3:8b');
    expect(long.inputTokens).toBeGreaterThan(short.inputTokens);
  });

  test('finaliseEstimate is a function', () => {
    expect(typeof getLib().finaliseEstimate).toBe('function');
  });

  test('finaliseEstimate updates outputTokens and estimatedUSD', () => {
    const lib = getLib();
    const est     = lib.estimateCost('Hello', 'llama3:8b', 0);
    const updated = lib.finaliseEstimate(est, 100);
    expect(updated.outputTokens).toBe(100);
    expect(updated.estimatedUSD).toBeGreaterThan(est.estimatedUSD);
  });

  test('getPricingTable is a function returning a non-empty object', () => {
    const table = getLib().getPricingTable();
    expect(typeof table).toBe('object');
    expect(Object.keys(table).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Persistent Conversation Memory
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — conversation memory', () => {
  test.each(['saveMemory', 'recallMemory', 'buildMemoryContext', 'clearMemory'])(
    '%s is a function',
    (method) => {
      expect(typeof (getLib() as any)[method]).toBe('function');
    },
  );

  test('saveMemory returns a Promise', () => {
    const p = getLib().saveMemory({ user_email: 'a@b.com', session_id: 's1', role: 'user', content: 'hi' });
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  test('recallMemory returns a Promise', () => {
    const p = getLib().recallMemory('a@b.com', 'hello');
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  test('buildMemoryContext returns a Promise', () => {
    const p = getLib().buildMemoryContext('a@b.com', 'hello');
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  test('clearMemory returns a Promise', () => {
    const p = getLib().clearMemory('a@b.com');
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. A/B Testing
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — A/B testing', () => {
  test('splitTest is a function', () => {
    expect(typeof getLib().splitTest).toBe('function');
  });

  test('splitTest returns a Promise', () => {
    const p = getLib().splitTest([{ label: 'A', prompt: 'hi' }]);
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  test('getABTestHistory is a function returning a Promise', () => {
    expect(typeof getLib().getABTestHistory).toBe('function');
    const p = getLib().getABTestHistory();
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. Scheduled Jobs
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — scheduled jobs', () => {
  test.each(['scheduleJob', 'runJob', 'runDueJobs', 'setJobStatus', 'cancelJob', 'listJobs'])(
    '%s is a function',
    (method) => {
      expect(typeof (getLib() as any)[method]).toBe('function');
    },
  );

  test('runDueJobs returns a Promise', () => {
    const p = getLib().runDueJobs();
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  test('listJobs returns a Promise', () => {
    const p = getLib().listJobs();
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. Hallucination / Grounding Checker
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — groundCheck', () => {
  test('groundCheck is a function', () => {
    expect(typeof getLib().groundCheck).toBe('function');
  });

  test('groundCheck returns a Promise', () => {
    const p = getLib().groundCheck('some response text', ['doc-id-1']);
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 21. Multi-Endpoint Failover
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — endpoint failover', () => {
  test.each(['withFailover', 'pingEndpoints', 'getEndpointHealth', 'resetEndpointHealth'])(
    '%s is a function',
    (method) => {
      expect(typeof (getLib() as any)[method]).toBe('function');
    },
  );

  test('withFailover returns a Promise', () => {
    const p = getLib().withFailover(async (ep) => ep);
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  test('pingEndpoints returns a Promise', () => {
    const p = getLib().pingEndpoints();
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {});
  });

  test('getEndpointHealth returns an array', () => {
    getLib().resetEndpointHealth();
    const health = getLib().getEndpointHealth();
    expect(Array.isArray(health)).toBe(true);
  });

  test('resetEndpointHealth clears cached state', () => {
    const lib = getLib();
    lib.resetEndpointHealth();
    expect(lib.getEndpointHealth()).toEqual([]);
  });
});





// ─────────────────────────────────────────────────────────────────────────────
// 21. Multi-Endpoint Failover
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientLibrary — readme integraty', () => {
  test.each(['getEndpointHealth'])(
    '%s is a function',
    (method) => {
      expect(typeof (getLib() as any)[method]).toBe('function');
    },
  );

});




