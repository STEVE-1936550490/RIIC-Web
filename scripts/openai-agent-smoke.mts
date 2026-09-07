// Migration-only entry point: old flags/credentials never initiate network requests.
console.log(JSON.stringify({ status: "MIGRATED", command: "npm run smoke:agent:responses", optIn: "RUN_RESPONSES_AGENT_SMOKE=1", configuration: ["AGENT_MODEL_PROTOCOL", "AGENT_MODEL_BASE_URL", "AGENT_MODEL_API_KEY", "AGENT_MODEL_ID"] }));
