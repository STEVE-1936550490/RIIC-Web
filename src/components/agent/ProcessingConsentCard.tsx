"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ProcessingStatus } from "@/server/agent/processing-access";
export default function ProcessingConsentCard({ onAccess, onRevoke }: { onAccess(allowed: boolean): void; onRevoke(): void }) {
  const t = useTranslations("AgentPanel");
  const mutation = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false); const [declined, setDeclined] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    onAccess(false);
    void fetch("/api/agent/consent", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((envelope) => { if (!controller.signal.aborted && envelope.success === true) { setStatus(envelope.data); onAccess(envelope.data.state === "ready" || envelope.data.state === "fake_test"); } })
      .catch(() => { if (!controller.signal.aborted) { setFailed(true); onAccess(false); } });
    return () => { controller.abort(); mutation.current?.abort(); };
  }, [onAccess]);
  async function change(method: "POST" | "DELETE") {
    mutation.current?.abort(); const operation = new AbortController(); mutation.current = operation;
    setBusy(true); setFailed(false); onAccess(false);
    if (method === "DELETE") onRevoke();
    try {
      const response = await fetch("/api/agent/consent", { method, signal: operation.signal, credentials: "same-origin", headers: { "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ accept: true, binding: status?.binding }) } : {}) });
      const envelope = await response.json(); if (!response.ok || envelope.success !== true) throw new Error();
      if (!operation.signal.aborted) { setStatus(envelope.data); onAccess(envelope.data.state === "ready" || envelope.data.state === "fake_test"); }
    } catch { if (!operation.signal.aborted) setFailed(true); } finally { if (!operation.signal.aborted) setBusy(false); }
  }
  const state = status?.state;
  const needsConsent = state === "consent_required" || state === "consent_outdated" || state === "consent_revoked";
  return <section className="space-y-2 rounded border p-3 text-sm" data-agent-processing={failed ? "external_unavailable" : state ?? "loading"}>
    <p>{failed ? t("processingError") : state ? t(state) : t("processingLoading")}</p>
    {status?.provider && <p>{status.provider.displayName}</p>}
    {needsConsent && !declined && <><p>{t("processingPurpose")}</p><p>{t("processingData")}</p><p>{t("processingExcluded")}</p><p>{t("processingWithdrawal")}</p></>}
    <a href="/privacy" target="_blank" rel="noreferrer" className="underline">{t("privacyLink")}</a>
    {status?.provider?.links.map((link) => <p key={link}><a href={link} target="_blank" rel="noreferrer" className="underline">{t("providerLink")}</a></p>)}
    {needsConsent && !declined && <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void change("POST")}>{t("grantProcessing")}</Button>
      <Button variant="outline" disabled={busy} onClick={() => { setDeclined(true); onAccess(false); }}>{t("declineProcessing")}</Button></div>}
    {needsConsent && declined && <Button variant="outline" onClick={() => setDeclined(false)}>{t("reviewProcessing")}</Button>}
    {(state === "ready" || state === "consent_outdated" || state === "external_unavailable" || failed) && <Button variant="outline" disabled={busy} onClick={() => void change("DELETE")}>{t("revokeProcessing")}</Button>}
  </section>;
}
