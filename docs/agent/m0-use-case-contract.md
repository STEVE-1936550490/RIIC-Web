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
