import { AgentRunError } from './run-contract.ts';
import type { ModelConfig } from './compatible-config.ts';
import type { SyntheticAcceptanceOptions } from './synthetic-acceptance-options.ts';

/** Supported live CLI uses a broker-issued run token, never an upstream credential. */
export async function brokerAcceptance(config: ModelConfig, mode: 'basic' | 'full', options: SyntheticAcceptanceOptions) {
  if (!/^http:\/\/127\.0\.0\.1:[0-9]+\/v1$/.test(config.baseURL) || !/^riic-run-[A-Za-z0-9_-]{43}$/.test(config.apiKey)) throw new AgentRunError('AGENT_MODEL_BROKER_REQUIRED');
  const meta = { protocol: config.protocol, model: config.model, mode, compatibilityMode: options.chatLegacyCompat ? 'explicit_chat_legacy' : 'default_strict' };
  const response = await fetch(`${config.baseURL}/authorization`, { method: 'POST', headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(meta), redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new AgentRunError('AGENT_MODEL_BROKER_AUTH_REJECTED');
  const grant = await response.json() as { run_id?: unknown; maximumAttempts?: unknown; endpointHash?: unknown };
  if (typeof grant.run_id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(grant.run_id) || typeof grant.maximumAttempts !== 'number' || !Number.isInteger(grant.maximumAttempts) || grant.maximumAttempts < 1 || grant.maximumAttempts > (mode === 'basic' ? 1 : 12) || typeof grant.endpointHash !== 'string' || !/^[0-9a-f]{64}$/.test(grant.endpointHash)) throw new AgentRunError('AGENT_MODEL_BROKER_AUTH_REJECTED');
  let sequence = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input) !== `${config.baseURL}/${config.protocol === 'responses' ? 'responses' : 'chat/completions'}` || init?.method !== 'POST' || sequence >= Number(grant.maximumAttempts)) throw new AgentRunError('AGENT_MODEL_BROKER_REQUEST_BUDGET');
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(meta)) headers.set(`X-RIIC-${key}`, value);
    headers.set('X-RIIC-Sequence', String(++sequence));
    return fetch(input, { ...init, headers, redirect: 'manual' });
  };
  return { fetcher, evidence: { runId: grant.run_id, upstreamEndpointHash: grant.endpointHash, maximumAttempts: grant.maximumAttempts } };
}
