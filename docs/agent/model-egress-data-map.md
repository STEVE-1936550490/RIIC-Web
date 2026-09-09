# Model Egress Data Map（M3.6）

本表追踪当前源码，不把历史 synthetic PASS 当外发授权。所有例子都是 synthetic。

## 链路

`AdvisorPanel` 将长度不超过 2000 的问题及白名单 `AgentContextSnapshot` 发往本站 `/api/agent`。Session 只在服务端生成 actor。严格 body/context 校验后，`processing-access` 在构造 external provider 和 saved-plan services 前核对两层批准。未批准的 MoMA 在此停止，模型 HTTP 为 0。

通过时由唯一 `runReadOnlyAgent` 运行四个只读工具。首轮只发送问题和工具定义，不发送快照。执行 M2 工具时继续做 actor、参数、domain consent、ownership、retention 和结果白名单检查。每轮 `model-payload-boundary` 从工具 DTO 构造最小 observation；Loop 和 Chat/Responses adapter 都重新检查服务器许可。Transport 只负责显式协议对应地址、假/部署凭据、安全请求和响应解析。最终来源始终由原始成功工具 DTO 在服务器生成，不由模型创建。

Responses 的 encrypted reasoning continuation 只保留既有 synthetic 测试路径；真实 business 路径拒绝。独立 M1 classifier 尚未纳入 business 载荷分类，仍拒绝 business 许可；实际 M0 API 不调用该 classifier。

## 分类与通用规则

| 分类 | 含义 | 例子（synthetic） |
| --- | --- | --- |
| PUBLIC | 程序静态协议、公开游戏词汇及固定枚举 | `current_plan.get_summary`, `lmd` |
| SYNTHETIC | 显式服务器验收 fixture；浏览器不得声明 | `synthetic-owner` |
| USER_BUSINESS_CONTEXT | 用户问题、布局、排班、所选干员、产出、保存方案事实 | `方案甲`, `durationHours: 8` |
| USER_IDENTIFIER | 网站身份；只用于服务端授权 | `user-example-1` |
| INTERNAL_IDENTIFIER | 持久化 ID、诊断 ID、页面关联 ID；不会作为元数据直接外发 | `plan-internal-example` |
| SENSITIVE_CREDENTIAL | 任何凭据 | `Cookie: fake-cookie` |
| PRIVATE_DIAGNOSTIC | 内部命令、路径、原始错误、日志、推理 | `stderr: fake-private` |
| PROHIBITED_EGRESS | 完整 Box、DOM、未分类/未批准字段、上述凭据和诊断 | `futureInternalField` |

下表所有允许项均需完整 Gate；目前真实 Provider 仍 BLOCK。`P` 为 user Prompt，`O` 为 tool observation。除标明静态 PUBLIC 项外，所有 P/O 值禁止普通日志、本站 Agent 持久化；仅本轮内存存在。现有 Workspace/保存方案在原功能的独立 consent/retention 下持久化，不因 Agent 增加副本。Provider 保留未核实，不能承诺其不持久化。Consent 记录有独立持久化规则。

结构对象、数组、null 只是下述已分类字段的容器；null 保留未知/无值语义，不以补值制造事实。字符串作为 data，不能成为 system policy。

## 浏览器、API 与首轮

| 字段/结构 | 来源、示例 | 分类 / 用户输入 / 内部 ID / 业务 | 必要性、目的与最小化 | P / O / 普通日志 / Agent 持久化 |
| --- | --- | --- | --- | --- |
| `message` | 用户输入：“查看贸易站当前班次” | BUSINESS / 是 / 可能由用户主动键入 / 是 | 理解问题；2000 上限，拒绝可识别凭据、URL/诊断粘贴；不能证明任意自由文本绝无秘密，UI 明确禁止填写凭据 | 是 / 否 / 否 / 否 |
| `context.schemaVersion, contextRevision, sampledAt, activeShift` | 页面投影，`1, revision-example, 2026-09-08T00:00:00Z, 0` | INTERNAL+BUSINESS / 不可信浏览器 / revision 是 / 是 | 本站校验、stale 与班次选择；不直接 stringify context | 否 / 仅工具所需派生值 / 否 / 否 |
| `context.currentPlan.diagnosticId` | 公共求解结果关联 `diagnostic-example` | INTERNAL / 浏览器 / 是 / 否 | 本站 source 校验；外发删除 | 否 / 否 / 否 / 否 |
| `context.currentPlan.{profile,roomCounts,shifts,production,training,rooms}` | 安全页面投影 | BUSINESS / 浏览器 / rooms 是游戏位置 / 是 | 仅供本地 M2；完整 snapshot 不外发，按实际工具返回下表字段 | 否 / 仅裁剪结果 / 否 / 否 |
| `context.observedSchedule.{source,sampledAt,rooms}` | 浏览器安全 Skland 排班投影，非凭据 | BUSINESS / 浏览器 / 否 / 是 | 仅请求房间的观测；与 planned 分离 | 否 / 仅请求房间 / 否 / 否 |
| `actor.userId, actor.requestId`、Session | 服务端 Session | USER_IDENTIFIER/INTERNAL / 否 / 是 / 否 | 鉴权和限流；永不进入模型 payload | 否 / 否 / 否（Agent）/ 否 |
| Loop `runId`, AbortSignal, EgressContext | 服务器生成 | INTERNAL/授权控制 / 否 / 是 / 否 | 绑定一次运行、取消和许可；adapter 不发 wire | 否 / 否 / 否 / 否 |
| tools `name,description,effect,inputSchema` | 四工具静态 Registry | PUBLIC / 否 / 否 / 否 | schema 严格，不能从请求覆盖；effect 不进入协议请求 | system/tool 定义 / 否 / 可静态记录 / 源码 |
| model/protocol/baseURL、认证 header | 显式服务器配置 | 配置/凭据 / 否 / 否 / 否 | model 是协议字段；baseURL 仅路由；Key 仅 Transport 认证，不进入 Prompt/observations/日志。它不属于业务数据 Payload | 否 / 否 / 否 / 不新增 |
| system instructions、Chat Schema 提示 | 静态适配器 | PUBLIC / 否 / 否 / 否 | 只读政策、Schema；不能替代本地校验 | system / 否 / 可 / 源码 |

## Tool call 和 Observation 字段

所有业务事实来源均为 M2 确定性代码；浏览器事实不构成服务端授权。下表逐个列出投影中允许的叶字段。共同日志/持久化均为“否”；均仅 O，不加入 system Prompt。

| 路径（`[]` 为数组元素） | 示例 | 分类、来源 | 需要原因 / 裁剪决定 |
| --- | --- | --- | --- |
| call `id,name,arguments` | `call-1,current_plan.get_room_detail,{roomRef:trade_2,shiftIndex:null}` | PUBLIC/运行标识及模型候选参数 | adapter 匹配工具回填；ID 合法、去重、run-scoped；参数再次本地校验；无用户身份字段 |
| summary args `{}` | `{}` | PUBLIC | 空严格对象，不发送 snapshot |
| room args `roomRef,shiftIndex` | `trade_2,null` | BUSINESS / 模型从用户问题提取 | 精确房间定位；null=active，0=首班，不变领域匹配 |
| list args `query` | `方案甲` 或 null | BUSINESS / 模型候选 | 用户要求的标题筛选，不放宽归属 |
| compare args `leftPlanId,rightPlanId` | `plan-<random UUID>` | INTERNAL alias | 只接受本轮 list 产生的别名；服务器映射回 ID 执行 domain service；旧调用者 fake/synthetic 不变 |
| result `status`, `issue.code`, `issue.reason` | `unavailable,NO_CURRENT_PLAN` | PUBLIC / 代码有限枚举 | 明确失败，不伪装成功；`issue.message` 删除 |
| result `truncation.applied,omittedCount` | `true,2` | BUSINESS / 裁剪 | 防止把不完整结果当完整 |
| result `source.type,sampledAt` | `current_context,2026-09-08T00:00:00Z` | PUBLIC+BUSINESS / 页面来源 | 事实类型、采样时间；`source.contextRevision,planDiagnosticId` 删除 |
| summary `profile.layoutLabel,rotationProfile` | `布局甲,default` | BUSINESS / 当前方案 | 解释布局与轮班口径；`ownedOperatorCount` 不必要，删除；完整 Box 禁止 |
| summary `activeShift.{index,durationHours,plannedRoomCount,plannedOccupiedSlots}` | `0,8,3,9` | BUSINESS / 当前 active | 回答当前班次；null 不猜补 |
| summary `shiftCount,shifts[].{index,durationHours,plannedRoomCount,plannedOccupiedSlots}` | `2`, 同上 | BUSINESS / 排班摘要 | 解释轮换，不发完整人员矩阵 |
| summary `rooms.total,rooms.byKind[].{kind,count}` | `3,trade,2` | BUSINESS / 布局聚合 | 房型分布，按类聚合 |
| summary `production.{source,reason}, values.{lmd,pureGold,experience,originiumShards,orundum}, unavailable[].{metric,reason}` | `solver,lmd:120` | BUSINESS+PUBLIC口径 / 原生产摘要 | 数值及来源不能混淆估算与求解；不发送 CLI/无人机额外记录 |
| summary `training.{status,shiftCount,reason},assignments[].{shiftIndex,traineeAssigned,trainerAssigned}` | `available,0,true,false` | BUSINESS / 训练摘要 | 只发有无分配，不发完整 Box |
| summary `limitations[].{code,metric,reason}` | `PRODUCTION_VALUE_UNAVAILABLE,lmd` | PUBLIC / 代码 | 缺值和口径限制 |
| room `data.room.{roomId,label,kind,index,level}`，失败 `room` 和 `candidates[]` 同一引用字段 | `trade_2,贸易站2,trade,1,3` | BUSINESS / 布局；roomId 非持久化对象 ID | 房间定位和歧义澄清，不扩大模糊匹配 |
| room `data.shift.{requestedShiftIndex,resolvedShiftIndex,usedActiveShift,durationHours}`，失败 `shift` 同选择字段 | `null,1,true,8` | BUSINESS / 本地选择 | 零基索引、active 选择与时长 |
| room `planned.{status,product,operators[],issue.code}` | `available,gold,干员甲` | BUSINESS / 请求的计划房间班次 | 解释分配；只返回所请求房间 |
| room `planned.efficiency.{…}` | `trade_pct:1.2` | BUSINESS / 数值白名单 | 仅下列 21 个独立分类的数值键；新增域字段不会自动入库外发政策 |
| room `observed.{status,source.type,sampledAt,operators[],issue.code,issue.reason}` | `available,skland_schedule,时间,干员乙` | BUSINESS / 请求房间观测 | 与 planned 分离，采样只说明当时观测 |
| room `limitations[]` | `OBSERVED_SNAPSHOT_AT_SAMPLED_AT` | PUBLIC / 代码 | 时效性与缺值说明 |
| list `plans[].{id,title,updatedAt}`；compare `data.left/right` 同形状 | `plan-随机值,方案甲,时间` | BUSINESS+run alias / 已授权元数据 | 标题及更新时间用于同名消歧；id 别名化；`diagnosticId,pinned,createdAt` 删除 |
| compare `data.samePlan,hasKnownDifferences` | `false,true` | BUSINESS / 确定性比较 | 相同对象与已知差异，不声称整体优劣 |
| compare `rooms[].{roomId,label,status},kind/level/configuredProduct.{left,right}` | `trade_2,changed,3→2` | BUSINESS / 比较投影 | 展示变化和可比性 |
| compare `rooms[].shifts[].{shiftIndex,product.{left,right},operators.{status,added[],removed[],reason},efficiency[].{metric,comparison}}` | `0,干员甲→干员乙` | BUSINESS / 确定性代码 | 人员按既有集合口径，不输出隐藏技能选择 |
| compare `shifts.count` 和 `changes[].{index,status,durationHours,periodsChanged,structureChanged}` | `2→3` | BUSINESS / 比较 | 班次数、时长、结构变化 |
| 所有 NumericDiff `status,left,right,delta,reason` | `comparable,120,180,60` | BUSINESS / 代码计算 | 模型不重算差值；缺值不可比不填 0 |
| compare `training.{status,reason},changes[].{shiftIndex,position,left,right}` | `0,trainee,干员甲,null` | BUSINESS / 比较 | 请求比较的训练变动 |
| compare `production.source,metrics[].{metric,unit,comparison}` | `solver_natural_24h,lmd,单位,NumericDiff` | BUSINESS / 自然24h确定性口径 | 不含无人机、不估算、不以求解耗时判断质量 |
| compare `limitations[]` | `NO_OVERALL_PLAN_QUALITY_RANKING` | PUBLIC / 代码 | 防止扩大结论 |

效率独立白名单：`final_efficiency,total_efficiency,order_multiplier,base_efficiency,equivalent_efficiency,global_efficiency,trade_equivalent_efficiency,trade_score,trade_pct,trade_skill_pct,trade_display_pct,trade_gold_pct,manu_score,manu_prod_total,manu_prod_skill,manu_display_pct,manu_storage_limit,power_score,power_skill_pct,power_display_pct,power_charge_speed_pct`。

## 禁止项与留存

Cookie、Session token、API Key（除服务器 Transport 自身认证 header）、Skland cred/token/device ID、DB URL、工作区加密密钥、CLI command/path/stdout/stderr、原始 stack/provider error、任意数据库记录、DOM、完整内部 debug、hidden reasoning、完整 Box 均禁止 Prompt/observation。字段注入或未知未来字段在路径级投影失败关闭；模型调用次数不会因兼容修补而增加。已明确删除的字段不被复制；不通过 object spread 接收未知业务字段。

自由文本不是可验证的秘密存储：可识别的凭据/URL/日志粘贴直接拒绝，而不是自动“修复”文本。无法从任意字符串证明它不是秘密，不能把此防护宣传为完美 DLP；用户界面明确不要粘贴凭据。将来扩大输入目的/字段必须重新分类并升级政策与 Consent。

最终 `answer` 回本站页面，`sources,tools,usage,runId,contextRevision` 由代码生成；不回传内部 gate reason、endpoint、raw error/stack。普通日志只沿既有安全 API 错误分类记录，不记录问题、工具 args/results 或 Provider 响应。没有 Agent 历史库/长期记忆。

独立 Consent 只存 `userId,consentVersion,privacyVersion,providerProfileId,providerProfileVersion,dataEgressPolicyVersion,grantedAt,revokedAt`；持久化是履行选择和撤回所需，不外发模型、不进普通日志；每个用户一行替换当前状态，账户删除 FK cascade 删除。它不保存用户业务问题，撤回也不删除用户方案。
