import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { agentProcessingConsent } from "../db/schema.ts";
import { PRIVACY_VERSION, PRIVACY_EFFECTIVE_DATE, isCurrentPolicyConsent, TERMS_VERSION } from "../../legal-policy.ts";
import { consentState } from "./processing-consent.ts";
import { consentFor } from "./egress-test-support.ts";
test("privacy version bump invalidates existing site and independent Agent consents", () => {
  assert.equal(PRIVACY_EFFECTIVE_DATE, "2026-09-08");
  assert.equal(isCurrentPolicyConsent({ termsAccepted: true, privacyAccepted: true, termsVersion: TERMS_VERSION, privacyVersion: "2026-09-06-processing-clarification" }), false);
  const consent = consentFor();
  assert.equal(consentState({ ...consent, privacyVersion: "old" }, consent.userId, { ...consent, privacyVersion: PRIVACY_VERSION }), "outdated");
});
test("additive consent migration agrees with Drizzle schema and isolates account ownership", () => {
  const table = getTableConfig(agentProcessingConsent);
  const sql = readFileSync(new URL("../../../drizzle/0016_agent_processing_consent.sql", import.meta.url), "utf8");
  assert.equal(table.name, "agent_processing_consent"); assert.equal(table.schema, "app");
  assert.deepEqual(table.columns.map((column) => column.name).sort(), ["user_id", "consent_version", "privacy_version", "provider_profile_id", "provider_profile_version", "data_egress_policy_version", "granted_at", "revoked_at"].sort());
  for (const column of table.columns) assert.ok(sql.includes(`"${column.name}"`));
  assert.match(sql, /"user_id" text PRIMARY KEY NOT NULL/); assert.match(sql, /REFERENCES "public"\."user"\("id"\) ON DELETE cascade/);
  assert.doesNotMatch(sql, /DROP|TRUNCATE|UPDATE "|DELETE FROM/);
  const journal = JSON.parse(readFileSync(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  assert.equal(journal.entries.at(-1).tag, "0016_agent_processing_consent");
});
test("both legal locales describe unverified processing, independent opt-in and limited withdrawal", () => {
  for (const locale of ["zh", "en"]) {
    const catalog = JSON.parse(readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), "utf8"));
    const text = catalog.app_privacy_page.agentProvider;
    assert.match(text, /MoMA/); assert.match(text, /store=false/);
    assert.match(text, locale === "en" ? /cannot receive real business context/ : /不允许接收真实业务上下文/);
    assert.match(text, locale === "en" ? /versioned opt-in/ : /版本化的明确同意/);
  }
});
