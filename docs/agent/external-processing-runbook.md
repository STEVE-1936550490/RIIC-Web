# M3.6 外部处理 / Consent Runbook

当前状态：工程 Gate 已实现；MoMA 未获数据处理批准，业务外发仍关闭。本文不是启动或部署授权。

## 操作员配置

`AGENT_FEATURE_ENABLED=1` 仅开启面板/API。`AGENT_EXTERNAL_BUSINESS_EGRESS_ENABLED=1` 是独立、默认关闭的 kill switch，不能单独放行。

另需显式设置 `AGENT_PROVIDER_PROFILE_ID`、`AGENT_PROVIDER_PROFILE_VERSION`、`AGENT_PRIVACY_VERSION`、`AGENT_DATA_EGRESS_POLICY_VERSION`；分别精确匹配服务器目录的 Profile、其版本、`PRIVACY_VERSION` 和 `DATA_EGRESS_POLICY_VERSION`。模型配置继续使用原协议/base URL/model/API key 四项；协议和 base URL 必须与 Profile 绑定匹配，尾斜杠等不同字符串也失败关闭。普通业务不启用 legacy 或 encrypted reasoning，不放宽原 20s Run / 5s Tool 与其他预算。

MoMA 目录当前为 `BLOCKED_UNVERIFIED_PROCESSING`，因此任何环境配置组合均不能放行。发布批准必须先审阅官方适用处理条款并更新 Profile 和必要的隐私文案，不能靠环境增加 Provider 或跳过 Consent。私网地址和 loopback 同样无自动信任。

## 独立同意

`GET /api/agent/consent` 使用服务端 Session，返回安全状态及必要显示字段，不含 endpoint、userId、批准内部原因或原始错误。feature disabled/fake/deployment blocked 不读取 Consent DB。

`POST` 要求 same-origin、Session、限流、JSON Schema；只接受 `{accept:true,binding:{consentVersion,privacyVersion,providerProfileId,providerProfileVersion,dataEgressPolicyVersion}}`。binding 是用户刚阅读卡片时的版本回显，只与服务器生成值比较，不允许客户端定义版本。未获批 Provider 没有可授予 binding。旧卡片 POST 被拒绝。

`DELETE` same-origin、Session、限流、空 body，只撤回当前 Session 用户。没有模型工具能调用它；不清理保存方案或 Workspace，不复用会清理业务数据的原 account data-consent 撤回路径。撤回返回后，下一次模型发送重新读当前状态并拒绝；已经发送的内容不能撤回。请求中途已进入 transport 的发送也不能追回，UI 取消本地等待不等于第三方删除。

Consent 表 `app.agent_processing_consent` 每个用户一行，原子 UPSERT / UPDATE 按用户主键序列化；后完成的明确 grant/revoke 决定状态。存五个绑定字段和 grant/revoke 时间；user FK cascade。Privacy/Provider/egress/consent version 变化自动使记录 outdated。数据类别或目的实质扩大必须升级 egress/privacy 版本。当前 privacy bump 也使原网站/Skland consent 依据既有版本规则要求重新同意，**原 consent 不等于 Agent consent**。

## UI

面板分 disabled、fake_test、external_unavailable、consent_required、consent_outdated、consent_revoked、ready。非 ready/fake 无法发送；同意卡明确列出 Provider、用途、数据摘要、排除项、本站/Provider 链接、主动同意与暂不启用。没有默认勾选、隐藏同意或模型生成文案。ready/outdated/unavailable 下可以找到撤回入口。未登录/错误仅显示通用不可用，不回显原异常。切换账户、重新打开、撤回及发现服务端阻断时清理/刷新权限。

## 数据库与验证

新增 `0016_agent_processing_consent` 是纯新增表/FK，不运行在生产 DB。离线 Drizzle generate 和 schema/SQL/journal 静态测试可运行且无数据库访问。现有 `test:auth-integration` 已包含真实 Drizzle store 的 synthetic PostgreSQL 测试（用户隔离、grant、revoke、重授予、版本失效、cascade）；需要测试专用 PostgreSQL 和既有测试角色/迁移设施。当前服务器未发现 psql/initdb/pg_ctl/PostgreSQL 目录，故本轮 PostgreSQL 执行验证 BLOCKED_ENVIRONMENT，不把静态验证称为数据库实测。

普通 `scripts/agent-offline-command.mjs` 只继承白名单环境，排除真实模型配置、opt-in、代理及生产 DB 配置。build/E2E 必须用 `create-agent-test-copy.mjs` 的当前文件副本；不能以 HEAD 替代未提交修改。不得执行真实 smoke/broker。Browser E2E 是 mock UI；两协议 mock HTTP 的 Loop→真实 M2 测试另作后端证据。
