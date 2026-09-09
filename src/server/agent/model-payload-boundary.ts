import { randomUUID } from "node:crypto";
import { markModelPayload } from "./business-egress.ts";
import { AgentRunError, record, text } from "./run-contract.ts";
import { toolDescriptor } from "./tool-registry.ts";
import type { LoopCall, LoopRequest } from "./loop-provider.ts";
// Path-specific, independently reviewed classification. A new field is never copied by default.
type Projection = "scalar" | "drop" | "alias" | { [key: string]: Projection } | readonly [Projection];
export class PayloadBoundaryError extends AgentRunError {
  readonly reason: "PROHIBITED_FIELD" | "PAYLOAD_CLASSIFICATION_FAILED";
  constructor(reason: "PROHIBITED_FIELD" | "PAYLOAD_CLASSIFICATION_FAILED") { super("AGENT_MODEL_EGRESS_BLOCKED"); this.reason = reason; }
}
const scalar = "scalar"; const drop = "drop";
const issue: Projection = { code: scalar, reason: scalar, message: drop };
const source: Projection = { type: scalar, contextRevision: drop, planDiagnosticId: drop, sampledAt: scalar };
const metadata: Projection = { id: "alias", title: scalar, diagnosticId: drop, pinned: drop, createdAt: drop, updatedAt: scalar };
const shift: Projection = { index: scalar, durationHours: scalar, plannedRoomCount: scalar, plannedOccupiedSlots: scalar };
const room: Projection = { roomId: scalar, label: scalar, kind: scalar, index: scalar, level: scalar };
const selection: Projection = { requestedShiftIndex: scalar, resolvedShiftIndex: scalar, usedActiveShift: scalar, durationHours: scalar };
const numeric: Projection = { status: scalar, left: scalar, right: scalar, delta: scalar, reason: scalar };
const pair: Projection = { left: scalar, right: scalar };
const person: Projection = { status: scalar, added: [scalar], removed: [scalar], reason: scalar };
// Independent policy list: extending the domain DTO must not silently expand external processing.
const efficiency: Projection = {
  final_efficiency: scalar, total_efficiency: scalar, order_multiplier: scalar, base_efficiency: scalar,
  equivalent_efficiency: scalar, global_efficiency: scalar, trade_equivalent_efficiency: scalar,
  trade_score: scalar, trade_pct: scalar, trade_skill_pct: scalar, trade_display_pct: scalar, trade_gold_pct: scalar,
  manu_score: scalar, manu_prod_total: scalar, manu_prod_skill: scalar, manu_display_pct: scalar, manu_storage_limit: scalar,
  power_score: scalar, power_skill_pct: scalar, power_display_pct: scalar, power_charge_speed_pct: scalar,
};
const summary: Projection = {
  profile: { layoutLabel: scalar, rotationProfile: scalar, ownedOperatorCount: drop }, activeShift: shift, shiftCount: scalar, shifts: [shift],
  rooms: { total: scalar, byKind: [{ kind: scalar, count: scalar }] },
  production: { source: scalar, values: { lmd: scalar, pureGold: scalar, experience: scalar, originiumShards: scalar, orundum: scalar }, reason: scalar, unavailable: [{ metric: scalar, reason: scalar }] },
  training: { status: scalar, shiftCount: scalar, assignments: [{ shiftIndex: scalar, traineeAssigned: scalar, trainerAssigned: scalar }], reason: scalar },
  limitations: [{ code: scalar, metric: scalar, reason: scalar }],
};
const detail: Projection = { room, shift: selection,
  planned: { product: scalar, efficiency, status: scalar, operators: [scalar], issue },
  observed: { status: scalar, source: { type: scalar }, sampledAt: scalar, operators: [scalar], issue }, limitations: [scalar] };
const comparison: Projection = { left: metadata, right: metadata, samePlan: scalar, hasKnownDifferences: scalar,
  rooms: [{ roomId: scalar, label: scalar, status: scalar, kind: pair, level: pair, configuredProduct: pair,
    shifts: [{ shiftIndex: scalar, product: pair, operators: person, efficiency: [{ metric: scalar, comparison: numeric }] }] }],
  shifts: { count: numeric, changes: [{ index: scalar, status: scalar, durationHours: numeric, periodsChanged: scalar, structureChanged: scalar }] },
  training: { status: scalar, reason: scalar, changes: [{ shiftIndex: scalar, position: scalar, left: scalar, right: scalar }] },
  production: { source: scalar, metrics: [{ metric: scalar, unit: scalar, comparison: numeric }] }, limitations: [scalar] };
const common = { status: scalar, source, truncation: { applied: scalar, omittedCount: scalar }, issue } as const;
export const MODEL_OBSERVATION_PROJECTIONS: Readonly<Record<string, Projection>> = {
  "current_plan.get_summary": { ...common, data: summary },
  "current_plan.get_room_detail": { ...common, data: detail, candidates: [room], room, shift: selection },
  "saved_plan.list": { ...common, plans: [metadata] },
  "saved_plan.compare": { ...common, data: comparison },
};
export function assertBusinessText(value: string): void {
  // Defense in depth for recognizable pasted secrets/diagnostics. Free text is not a secret vault.
  if (/(?:\b(?:cookie|authorization|api[_ -]?key|session[_ -]?token|skland|device[_ -]?id|cred(?:ential)?|database_url|stderr|stdout|stack)\s*[:=]|\bBearer\s+|\bsk-[A-Za-z0-9_-]{8,}|(?:postgres(?:ql)?|mysql):\/\/|-----BEGIN .*PRIVATE KEY|https?:\/\/|\bat \S+\([^\n]+:\d+:\d+\))/i.test(value)) throw new PayloadBoundaryError("PROHIBITED_FIELD");
}
export function createModelPayloadBoundary() {
  const toAlias = new Map<string, string>(); const fromAlias = new Map<string, string>();
  function project(value: unknown, schema: Projection): unknown {
    if (schema === "drop") return undefined;
    if (value === null) return null;
    if (schema === "scalar") {
      if (typeof value === "string") { assertBusinessText(value); return value; }
      if (typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
      throw new PayloadBoundaryError("PAYLOAD_CLASSIFICATION_FAILED");
    }
    if (schema === "alias") {
      const id = text(value, 128); let alias = toAlias.get(id);
      if (!alias) { alias = `plan-${randomUUID()}`; toAlias.set(id, alias); fromAlias.set(alias, id); }
      return alias;
    }
    if (Array.isArray(schema)) {
      if (!Array.isArray(value)) throw new PayloadBoundaryError("PAYLOAD_CLASSIFICATION_FAILED");
      return value.map((item) => project(item, schema[0]));
    }
    const input = record(value); const fields = schema as Record<string, Projection>; const output: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      if (!Object.hasOwn(fields, key)) throw new PayloadBoundaryError(/cookie|key|cred|token|database|stderr|stdout|box|reasoning/i.test(key) ? "PROHIBITED_FIELD" : "PAYLOAD_CLASSIFICATION_FAILED");
      if (fields[key] !== "drop") output[key] = project(input[key], fields[key]);
    }
    return output;
  }
  return {
    observation(name: string, result: unknown) {
      const schema = MODEL_OBSERVATION_PROJECTIONS[name];
      if (!schema) throw new PayloadBoundaryError("PAYLOAD_CLASSIFICATION_FAILED");
      return project(result, schema);
    },
    resolveCall(call: LoopCall): LoopCall {
      const args = toolDescriptor(call.name).parse(call.arguments);
      if (call.name !== "saved_plan.compare") return { id: call.id, name: call.name, arguments: args };
      const raw = record(args); const left = fromAlias.get(String(raw.leftPlanId)); const right = fromAlias.get(String(raw.rightPlanId));
      if (!left || !right) throw new AgentRunError("AGENT_TOOL_INVALID_INPUT");
      return { id: call.id, name: call.name, arguments: { leftPlanId: left, rightPlanId: right } };
    },
    request(request: LoopRequest): LoopRequest {
      assertBusinessText(request.message);
      const payload: LoopRequest = { runId: request.runId, message: text(request.message, 2000), signal: request.signal, egress: request.egress,
        tools: request.tools.map((tool) => {
          const descriptor = toolDescriptor(tool.name);
          return { name: descriptor.name, description: descriptor.description, effect: descriptor.effect, inputSchema: structuredClone(descriptor.inputSchema) };
        }),
        observations: request.observations.map((item) => ({ call: { id: item.call.id, name: item.call.name, arguments: toolDescriptor(item.call.name).parse(item.call.arguments) }, result: project(item.result, MODEL_OBSERVATION_PROJECTIONS[item.call.name]) })),
      };
      // Rebuild each round from original tool DTOs. The per-run ID map keeps prior aliases stable.
      markModelPayload(payload); return payload;
    },
  };
}
