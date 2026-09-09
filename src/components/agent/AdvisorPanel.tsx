"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { previewExampleSnapshot } from "@/server/agent/preview-example";
import { requestedPreview } from "@/server/agent/preview-contract";
import ProcessingConsentCard from "./ProcessingConsentCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { createSafeCurrentPlanSnapshot, createSafeObservedScheduleSnapshot, parseAgentContextSnapshot, validateAgentContextSnapshot } from "@/server/agent/context-contract";
import { isAgentResultCurrent, parseAgentFinalResult, record, text } from "@/server/agent/run-contract";
import type { AgentFinalResult } from "@/server/agent/run-contract";
import type { BaseBlueprint, PublicPlanData, SklandScheduleSnapshot } from "@/types";

export default function AdvisorPanel(props: { plan: PublicPlanData | null; layout: BaseBlueprint; activeShift: number; observed: SklandScheduleSnapshot | null; accountKey: string | null }) {
  const t = useTranslations("AgentPanel"); const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [version, setVersion] = useState({ ...props, number: 0 });
  // React's guarded render-state update prevents even a single render of an old answer.
  if (version.plan !== props.plan || version.layout !== props.layout || version.activeShift !== props.activeShift || version.observed !== props.observed || version.accountKey !== props.accountKey) {
    setVersion({ ...props, number: version.number + 1 });
  }
  const [previewExampleSelected, setPreviewExampleSelected] = useState(false);
  const revision = `advisor-${id}-${version.number}-${previewExampleSelected ? "synthetic" : "page"}`;
  const projection = useMemo(() => {
    try { return { currentPlan: props.plan ? createSafeCurrentPlanSnapshot({ plan: props.plan, layout: props.layout, includeRoomDetails: true }) : null,
      observedSchedule: props.observed ? createSafeObservedScheduleSnapshot(props.observed) : null }; }
    catch { return null; }
  }, [props.plan, props.layout, props.observed]);
  const [open, setOpen] = useState(false); const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<AgentFinalResult | null>(null);
  const [processingRevision, setProcessingRevision] = useState(0);
  const [access, setAccess] = useState({ accountKey: props.accountKey, allowed: false });
  const onAccess = useCallback((allowed: boolean) => setAccess({ accountKey: props.accountKey, allowed }), [props.accountKey]);
  const canSend = access.accountKey === props.accountKey && access.allowed;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const stale = response !== null && (!isAgentResultCurrent(response, revision) || responseMessage !== message);
  function stop() { controller.current?.abort(); controller.current = null; setPending(false); setError("AGENT_ABORTED"); }
  async function send() {
    if (!canSend) return;
    controller.current?.abort(); const run = new AbortController(); controller.current = run;
    setPending(true); setResponse(null); setResponseMessage(message); setError(null);
    try {
      if (!projection) throw new Error("AGENT_INVALID_CONTEXT");
      const context = parseAgentContextSnapshot({ schemaVersion: 1, contextRevision: revision, sampledAt: new Date().toISOString(), activeShift: previewExampleSelected ? 0 : props.plan ? props.activeShift : 0, ...(previewExampleSelected ? { currentPlan: previewExampleSnapshot() } : projection) });
      validateAgentContextSnapshot(context);
      const res = await fetch("/api/agent", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context }), signal: run.signal });
      const envelope = record(await res.json());
      if (envelope.success !== true) { const issue = record(envelope.error); throw new Error(text(issue.code, 80)); }
      const data = record(envelope.data);
      if (!Object.hasOwn(data, "runId")) throw new Error(text(data.error, 80));
      const result = parseAgentFinalResult(data);
      if (result.error === "AGENT_MODEL_EGRESS_BLOCKED") { onAccess(false); setProcessingRevision((value) => value + 1); }
      if (result.contextRevision !== context.contextRevision) throw new Error("STALE_CONTEXT");
      if (!run.signal.aborted && controller.current === run) setResponse(result);
    } catch (caught) {
      if (!run.signal.aborted && controller.current === run) setError(caught instanceof Error && /^(AGENT_|AIC-|STALE_CONTEXT)[A-Z0-9_-]*$/.test(caught.message) ? caught.message : "AGENT_REQUEST_FAILED");
    } finally { if (controller.current === run) { setPending(false); controller.current = null; } }
  }
  return <Sheet open={open} modal={false} onOpenChange={(value) => { setOpen(value); if (!value && pending) stop(); }}>
    <SheetTrigger render={<Button variant="outline" className="fixed right-4 bottom-4 z-40" data-agent-open />}>{t("title")}</SheetTrigger>
    <SheetContent side="right" className="sm:max-w-md" data-agent-panel>
      <SheetHeader><SheetTitle>{t("title")}</SheetTitle><SheetDescription>{t("notice")}</SheetDescription></SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <ProcessingConsentCard key={`${props.accountKey}-${open}-${processingRevision}`} onAccess={onAccess} onRevoke={() => { stop(); setResponse(null); }} />
        <p className="text-xs text-muted-foreground">{t("commands")}</p>
        <label className="text-sm"><input type="checkbox" checked={previewExampleSelected} onChange={(event) => { stop(); setError(null); setPreviewExampleSelected(event.target.checked); }} /> {t("previewExample")}</label>
        {previewExampleSelected && <p className="text-xs">{t("previewInstructions")}</p>}
        <label htmlFor={`${id}-message`}>{t("question")}</label>
        <textarea id={`${id}-message`} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-24 rounded border bg-background p-2" />
        <div className="flex gap-2"><Button onClick={() => void send()} disabled={!canSend || pending || !message.trim()}>{t("send")}</Button>
          <Button variant="outline" onClick={stop} disabled={!pending}>{t("stop")}</Button></div>
        <div aria-live="polite">
          {pending && <p role="status">{requestedPreview(message) ? t("previewRunning") : t("loading")}</p>}
          {error && <p role="alert">{error}</p>}
          {stale && <p role="alert">STALE_CONTEXT — {t("stale")}</p>}
          {response && !stale && <div data-agent-answer className="space-y-3">
            <p>{response.modelMode === "fake_test" ? "MODEL_MODE: FAKE / TEST" : "MODEL_MODE: EXTERNAL"}</p>
            {response.error && <p role="alert">{response.error}</p>}
            <p className="whitespace-pre-wrap break-words">{response.answer}</p>
            {response.preview && <section data-agent-preview className="space-y-2 rounded border p-3">
              <p>{t("previewTitle")} — Preview only · {t("previewNotSaved")} · {t("previewNotApplied")}</p>
              <p>{response.preview.status === "ok" ? t("previewSuccess") : t("previewFailure")}</p>
              <p>{t("previewAssumptions")}: {response.preview.assumptions.rotationProfile} · SYNTHETIC</p>
              {response.preview.differences && <table className="w-full text-xs"><thead><tr><th>{t("previewMetric")}</th><th>{t("previewCurrent")}</th><th>Preview</th><th>Δ</th></tr></thead><tbody>
                {Object.entries(response.preview.differences).map(([metric, diff]) => <tr key={metric}><td>{metric}</td><td>{diff.current ?? "—"}</td><td>{diff.preview ?? "—"}</td><td>{diff.delta ?? "—"}</td></tr>)}
              </tbody></table>}
              <p className="break-all text-xs">revision: {response.preview.baseRevision} · {response.preview.currentRevision}</p>
              <p className="text-xs">source: {response.preview.source.engine} · sampledAt: {response.preview.source.sampledAt} · computedAt: {response.preview.computedAt} · cache: {String(response.preview.cacheHit)}</p>
              <p className="text-xs">{t("previewLimitation")}</p>
              {response.preview.issue && <p role="alert">{response.preview.issue.code}</p>}
            </section>}
            <ul aria-label={t("tools")}>{response.tools.map((tool, i) => <li className="rounded border p-2" key={i}>{tool.name}: {tool.status} {tool.code} ({tool.latencyMs} ms)</li>)}</ul>
            <ul aria-label={t("sources")}>{response.sources.map((source, i) => <li className="break-all text-xs" key={i}>{source.type} · {source.contextRevision} · {source.planDiagnosticId} · {source.planId} · {source.sampledAt ? `sampledAt: ${source.sampledAt}` : `updatedAt: ${source.updatedAt}`}</li>)}</ul>
            <ul aria-label={t("limitations")}>{response.limitations.map((item) => <li className="text-xs" key={item}>{item}</li>)}</ul>
            <p className="break-all text-xs">runId: {response.runId}</p>
          </div>}
          {(error || stale || response?.status === "failed") && <Button variant="outline" disabled={!canSend || pending || !message.trim()} onClick={() => void send()}>{t("retry")}</Button>}
        </div>
      </div>
    </SheetContent>
  </Sheet>;
}
