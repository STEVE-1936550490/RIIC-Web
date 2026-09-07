import assert from "node:assert/strict";
import { register, registerHooks } from "node:module";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema.ts";

register("../../scripts/ts-path-loader.mjs", import.meta.url);

test("production metadata query is owner-scoped and never selects result, context, or Box bindings", async (context) => {
  const marker = registerHooks({ resolve(specifier, context, nextResolve) {
    return specifier === "server-only" ? { shortCircuit: true, url: "data:text/javascript,export{}" } : nextResolve(specifier, context);
  } });
  context.after(() => marker.deregister());
  const { savedPlanMetadataQuery } = await import("./saved-plan-read-server.ts");
  const database = drizzle.mock({ schema });
  const query = savedPlanMetadataQuery(database, "synthetic-owner", new Date("2026-09-07T00:00:00.000Z")).toSQL();
  assert.match(query.sql, /where .*"saved_plan"\."user_id" = \$1/);
  assert.equal(query.params[0], "synthetic-owner");
  assert.match(query.sql, /"expires_at" >=/);
  assert.match(query.sql, /order by .*"pinned" desc, .*"updated_at" desc, .*"id" asc/);
  for (const column of ["public_result", "calculation_context", "operbox_content_hmac", "operbox_hmac_key_version"]) assert.equal(query.sql.includes(column), false);
});
