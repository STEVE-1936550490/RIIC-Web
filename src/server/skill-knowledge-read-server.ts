import "server-only";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "./db/index.ts";
import { skillAnnotation } from "./db/schema.ts";
import { createSkillKnowledgeService } from "./skill-knowledge-service.ts";

/** Same public rows as GET /api/skill-annotations; no draft state exists in this schema.
 * SELECT only public fields for one stable operator/skill pair. No maintenance writes.
 */
export function skillAnnotationKnowledgeQuery(db: Pick<ReturnType<typeof getDatabase>, "select">, operatorId: string, skillId: string) {
  return db.select({ note: skillAnnotation.note, updatedAt: skillAnnotation.updatedAt }).from(skillAnnotation)
    .where(and(eq(skillAnnotation.operatorId, operatorId), eq(skillAnnotation.skillId, skillId))).limit(1);
}
export function createPublicSkillKnowledgeService() {
  return createSkillKnowledgeService({ readAnnotation: async (operatorId, skillId) => {
    const [row] = await skillAnnotationKnowledgeQuery(getDatabase(), operatorId, skillId);
    return row ? { note: row.note, updatedAt: row.updatedAt.toISOString() } : null;
  } });
}
