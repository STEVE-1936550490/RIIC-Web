import { exact, text, AgentRunError } from "./run-contract.ts";
export const PREVIEW_ROTATIONS = ["main_backup_12_12", "abc_12_6_6", "abc_12_12_12"] as const;
export type PreviewRotation = typeof PREVIEW_ROTATIONS[number];
export type PreviewInput = { baseRevision: string; rotationProfile: PreviewRotation };
export function parsePreviewInput(value: unknown): PreviewInput {
  const r = exact(value, ["baseRevision", "rotationProfile"]);
  if (!PREVIEW_ROTATIONS.some((item) => item === r.rotationProfile)) throw new AgentRunError("AGENT_TOOL_INVALID_INPUT");
  return { baseRevision: text(r.baseRevision, 80), rotationProfile: r.rotationProfile as PreviewRotation };
}
/** Deliberately small fake-provider grammar; general natural-language inference is not claimed. */
export function requestedPreview(message: string): PreviewRotation | null {
  const match = /^(?:preview\s+|如果把轮换改成\s*)(main_backup_12_12|abc_12_6_6|abc_12_12_12)(?:，试算一下。?|\s+试算一下。?)?$/i.exec(message.trim());
  return match ? match[1].toLowerCase() as PreviewRotation : null;
}
export type PreviewResult = {
  status: "ok" | "unavailable";
  semantics: "PREVIEW_ONLY"; saved: "NOT_SAVED"; applied: "NOT_APPLIED";
  assumptions: { rotationProfile: PreviewRotation; candidates: 1; data: "SYNTHETIC" };
  baseRevision: string; currentRevision: string;
  source: { type: "planning_preview"; engine: "synthetic_mock_solver"; contextRevision: string; sampledAt: string };
  computedAt: string; cacheHit: boolean;
  summary: { shiftCount: number; lmd: number | null } | null;
  differences: { shiftCount: { current: number; preview: number; delta: number }; lmd: { current: number | null; preview: number | null; delta: number | null } } | null;
  issue: { code: string } | null;
  limitations: string[];
  truncation: { applied: false; omittedCount: 0 };
};
export function parsePreviewResult(value: unknown): PreviewResult {
  const r = exact(value, ["status", "semantics", "saved", "applied", "assumptions", "baseRevision", "currentRevision", "source", "computedAt", "cacheHit", "summary", "differences", "issue", "limitations", "truncation"]);
  const bad = () => { throw new AgentRunError("AGENT_INVALID_OUTPUT"); };
  if (!["ok", "unavailable"].includes(String(r.status)) || r.semantics !== "PREVIEW_ONLY" || r.saved !== "NOT_SAVED" || r.applied !== "NOT_APPLIED" || typeof r.cacheHit !== "boolean") bad();
  const assumptions = exact(r.assumptions, ["rotationProfile", "candidates", "data"]);
  parsePreviewInput({ baseRevision: r.baseRevision, rotationProfile: assumptions.rotationProfile });
  if (assumptions.candidates !== 1 || assumptions.data !== "SYNTHETIC") bad();
  const source = exact(r.source, ["type", "engine", "contextRevision", "sampledAt"]);
  if (source.type !== "planning_preview" || source.engine !== "synthetic_mock_solver" || source.contextRevision !== r.currentRevision) bad();
  for (const v of [r.baseRevision, r.currentRevision]) text(v, 80);
  for (const v of [r.computedAt, source.sampledAt]) if (!Number.isFinite(Date.parse(text(v, 40)))) bad();
  const finite = (v: unknown, nullable = false) => { if (!(nullable && v === null) && (typeof v !== "number" || !Number.isFinite(v))) bad(); };
  if (r.status === "ok") {
    const summary = exact(r.summary, ["shiftCount", "lmd"]); finite(summary.shiftCount); finite(summary.lmd, true);
    const diff = exact(r.differences, ["shiftCount", "lmd"]);
    for (const key of ["shiftCount", "lmd"]) {
      const pair = exact(diff[key], ["current", "preview", "delta"]);
      for (const v of Object.values(pair)) finite(v, key === "lmd");
      if (pair.preview !== summary[key] || pair.delta !== (pair.current === null || pair.preview === null ? null : Number(pair.preview) - Number(pair.current))) bad();
    }
    if (r.issue !== null) bad();
  } else { if (r.summary !== null || r.differences !== null) bad(); text(exact(r.issue, ["code"]).code, 80); }
  if (!Array.isArray(r.limitations) || r.limitations.length > 8) bad();
  for (const v of r.limitations as unknown[]) text(v, 128);
  const truncation = exact(r.truncation, ["applied", "omittedCount"]);
  if (truncation.applied !== false || truncation.omittedCount !== 0) bad();
  return structuredClone(value) as PreviewResult;
}
