import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticSmokeCommand } from './synthetic-smoke-command.ts';
test('supported acceptance rejects direct upstream even with opt-in and credential', async (t) => {
  let sends = 0;
  t.mock.method(globalThis, 'fetch', async () => { sends++; throw new Error('OFFLINE_ONLY'); });
  const result = await syntheticSmokeCommand({AGENT_MODEL_PROTOCOL:'chat_completions',AGENT_MODEL_ID:'synthetic-model',AGENT_MODEL_API_KEY:'fake-not-a-secret',AGENT_MODEL_BASE_URL:'https://gateway.example.invalid/v1',RUN_COMPATIBLE_AGENT_SMOKE:'1'}, 'RUN_COMPATIBLE_AGENT_SMOKE');
  assert.equal(result.code,'AGENT_MODEL_BROKER_REQUIRED');
  assert.equal(result.requests,0);
  assert.equal(sends,0);
});
