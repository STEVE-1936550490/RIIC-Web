import type {
  AgentModelMetadata,
  AgentModelProvider,
  AgentModelProviderResult,
  AgentModelRequest,
} from "./model-provider.ts";

export type FakeAgentModelScenario =
  | {
      kind: "success" | "shape-invalid" | "semantic-invalid";
      output: unknown;
      metadata?: AgentModelMetadata;
    }
  | { kind: "provider-error"; error?: unknown }
  | { kind: "timeout" };

export class FakeAgentModelProvider implements AgentModelProvider {
  readonly requests: AgentModelRequest[] = [];
  private readonly scenario: FakeAgentModelScenario;

  constructor(scenario: FakeAgentModelScenario) {
    this.scenario = scenario;
  }

  async generateStructuredOutput(request: AgentModelRequest): Promise<AgentModelProviderResult> {
    this.requests.push(request);
    request.signal.throwIfAborted();

    if (this.scenario.kind === "provider-error") {
      throw this.scenario.error ?? new Error("Fake provider error");
    }
    if (this.scenario.kind === "timeout") {
      return new Promise((_resolve, reject) => {
        const rejectForAbort = () => reject(
          request.signal.reason ?? new DOMException("The operation was aborted", "AbortError"),
        );
        if (request.signal.aborted) rejectForAbort();
        else request.signal.addEventListener("abort", rejectForAbort, { once: true });
      });
    }
    return {
      output: this.scenario.output,
      metadata: this.scenario.metadata ?? {},
    };
  }
}
