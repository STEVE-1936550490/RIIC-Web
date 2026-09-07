import "server-only";
export function agentFeatureConfig(env: { AGENT_FEATURE_ENABLED?: string; AGENT_MODEL_MODE?: string; APP_DEPLOYMENT_ENV?: string; NODE_ENV?: string } = process.env) {
  const enabled = env.AGENT_FEATURE_ENABLED === "1";
  const local = env.APP_DEPLOYMENT_ENV === "development" || env.NODE_ENV === "test";
  return { enabled, fakeAllowed: enabled && local && env.APP_DEPLOYMENT_ENV !== "production" && env.AGENT_MODEL_MODE === "fake" };
}
