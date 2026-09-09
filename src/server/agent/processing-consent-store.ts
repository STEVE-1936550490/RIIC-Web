import "server-only";
import { eq } from "drizzle-orm";
import { getDatabase } from "../db/index.ts";
import { agentProcessingConsent } from "../db/schema.ts";
import type { AgentConsentStore } from "./processing-consent.ts";
export function createAgentConsentStore(database = getDatabase): AgentConsentStore {
  return {
    async get(userId) {
      const [row] = await database().select().from(agentProcessingConsent).where(eq(agentProcessingConsent.userId, userId)).limit(1);
      return row ?? null;
    },
    async grant(value) {
      await database().insert(agentProcessingConsent).values(value).onConflictDoUpdate({ target: agentProcessingConsent.userId, set: value });
    },
    async revoke(userId) {
      await database().update(agentProcessingConsent).set({ revokedAt: new Date() }).where(eq(agentProcessingConsent.userId, userId));
    },
  };
}
export const agentConsentStore = createAgentConsentStore();
