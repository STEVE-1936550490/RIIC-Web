"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  const revision = `advisor-${id}-${version.number}`;
  const projection = useMemo(() => {
    try { return { currentPlan: props.plan ? createSafeCurrentPlanSnapshot({ plan: props.plan, layout: props.layout, includeRoomDetails: true }) : null,
      observedSchedule: props.observed ? createSafeObservedScheduleSnapshot(props.observed) : null }; }
    catch { return null; }
  }, [props.plan, props.layout, props.observed]);
  const [open, setOpen] = useState(false); const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AgentFinalResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const stale = response !== null && !isAgentResultCurrent(response, revision);
  function stop() { controller.current?.abort(); controller.current = null; setPending(false); setError("AGENT_ABORTED"); }
  async function send() {
    controller.current?.abort(); const run = new AbortController(); controller.current = run;
    setPending(true); setResponse(null); setError(null);
    try {
      if (!projection) throw new Error("AGENT_INVALID_CONTEXT");
      const context = parseAgentContextSnapshot({ schemaVersion: 1, contextRevision: revision, sampledAt: new Date().toISOString(), activeShift: props.plan ? props.activeShift : 0, ...projection });
      validateAgentContextSnapshot(context);
      const res = await fetch("/api/agent", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context }), signal: run.signal });
      const envelope = record(await res.json());
      if (envelope.success !== true) { const issue = record(envelope.error); throw new Error(text(issue.code, 80)); }
      const data = record(envelope.data);
      if (!Object.hasOwn(data, "runId")) throw new Error(text(data.error, 80));
      const result = parseAgentFinalResult(data);
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
        <p className="text-xs text-muted-foreground">{t("commands")}</p>
        <label htmlFor={`${id}-message`}>{t("question")}</label>
        <textarea id={`${id}-message`} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-24 rounded border bg-background p-2" />
        <div className="flex gap-2"><Button onClick={() => void send()} disabled={pending || !message.trim()}>{t("send")}</Button>
          <Button variant="outline" onClick={stop} disabled={!pending}>{t("stop")}</Button></div>
        <div aria-live="polite">
          {pending && <p role="status">{t("loading")}</p>}
          {error && <p role="alert">{error}</p>}
          {stale && <p role="alert">STALE_CONTEXT — {t("stale")}</p>}
          {response && !stale && <div data-agent-answer className="space-y-3">
            <p>{response.modelMode === "fake_test" ? "MODEL_MODE: FAKE / TEST" : "MODEL_MODE: EXTERNAL"}</p>
            {response.error && <p role="alert">{response.error}</p>}
            <p className="whitespace-pre-wrap break-words">{response.answer}</p>
            <ul aria-label={t("tools")}>{response.tools.map((tool, i) => <li className="rounded border p-2" key={i}>{tool.name}: {tool.status} {tool.code} ({tool.latencyMs} ms)</li>)}</ul>
            <ul aria-label={t("sources")}>{response.sources.map((source, i) => <li className="break-all text-xs" key={i}>{source.type} · {source.contextRevision} · {source.planDiagnosticId} · {source.planId} · {source.sampledAt ? `sampledAt: ${source.sampledAt}` : `updatedAt: ${source.updatedAt}`}</li>)}</ul>
            <ul aria-label={t("limitations")}>{response.limitations.map((item) => <li className="text-xs" key={item}>{item}</li>)}</ul>
            <p className="break-all text-xs">runId: {response.runId}</p>
          </div>}
          {(error || stale || response?.status === "failed") && <Button variant="outline" disabled={pending || !message.trim()} onClick={() => void send()}>{t("retry")}</Button>}
        </div>
      </div>
    </SheetContent>
  </Sheet>;
}
