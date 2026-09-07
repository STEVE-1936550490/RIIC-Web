// Historical entry point remains Responses-only; shared acceptance executes both protocols.
import type { ResponsesConfig } from "./responses-config.ts";
import { assertResponsesConfig } from "./responses-config.ts";
import { runSyntheticCompatibleSmoke } from "./compatible-smoke.ts";
export async function runSyntheticResponsesSmoke(config: ResponsesConfig, fetcher: typeof fetch = fetch) {
  assertResponsesConfig(config);
  return runSyntheticCompatibleSmoke(config, fetcher);
}
