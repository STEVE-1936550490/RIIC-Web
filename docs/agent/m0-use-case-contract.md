# Agent M0 Use Case Contract

## Product boundary

The first version is a read-only infrastructure scheduling advisor. Its approved use cases are:

- explain the current schedule;
- inspect a specified room and its assignments;
- compare two saved plans.

The approved first-version tools are:

- `current_plan.get_summary`;
- `current_plan.get_room_detail`;
- `saved_plan.list`;
- `saved_plan.compare`.

Changing these use cases or permission boundaries requires renewed confirmation.

## Responsibility boundary

The model may understand the question, select an allowed tool, identify missing or ambiguous parameters, and explain deterministic tool results.

Deterministic TypeScript code owns queries, authorization, argument and result validation, room resolution, numeric and plan comparisons, output whitelists, and stable errors.

Tool permissions must never exceed the current user's permissions. Page context is untrusted input and is not proof of authorization. `contextRevision` is a correlation value and must remain separate from `diagnosticId`.

## Prohibited first-version capabilities

The first version must not:

- modify a Workspace, layout, schedule, or operator box;
- save, delete, pin, apply, or automatically solve a plan;
- connect directly to a database;
- execute shell commands, arbitrary URLs, or arbitrary SQL;
- read cookies, tokens, Skland credentials, or CLI stdout/stderr;
- add RAG, long-term memory, multi-agent behavior, or any write operation.

Until the applicable policy and data-processing boundaries are complete, real user business context must not be sent to an external model.

## M3.6 数据处理授权澄清（2026-09-08）

M0 场景与四个 read-only Tool 不变。外部模型业务上下文的授权与业务读取/写入授权分开：部署/Provider 批准、独立版本化用户 Consent、最小化 payload 三者缺一即阻断；Consent 的 grant/revoke 是本站政策状态 API，不是 Agent 业务 Tool。原网站/Skland consent 不覆盖外部模型目的。

完整 Workspace/Box、凭据、内部诊断、未分类字段均不外发；保存方案 ID 在获批 business 路径中使用 run-scoped alias。模型不新增 solver、排班试算、保存方案、RAG、长期记忆或写权限。当前 MoMA 处理证据未核实，`REAL_USER_CONTEXT_TO_EXTERNAL_MODEL=BLOCKED_PRIVACY`；合成兼容 PASS 不构成放行依据。字段与部署边界见 [Data Map](./model-egress-data-map.md)、[Provider 证据](./provider-data-processing.md) 及 [Consent Runbook](./external-processing-runbook.md)。
