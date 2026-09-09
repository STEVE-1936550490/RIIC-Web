# Provider 数据处理证据与批准（M3.6，2026-09-08）

协议、SDK、模型、endpoint 与 Provider 是不同概念。合成协议验收不构成数据处理批准；用户同意不构成供应商批准。当前目录没有任何获批真实 Provider。

## 本轮公开资料核验

仅查询公开网页，没有请求模型 API、`/models` 或任何推理路由。已尝试读取以下官方入口；访问失败不能证明政策不存在，仅表示本轮未获得可审查的正文。

| 官方入口 | 本轮可取得的证据 | 可作出的结论 |
| --- | --- | --- |
| [MoMA 平台](https://moma.cmecloud.cn/) | 公开页面抓取失败 | endpoint 绑定来自既有用户配置；不是处理条件证据 |
| [中国移动云门户](https://ecloud.10086.cn/) | 抓取失败 | 未核实 API 处理条款 |
| [移动云帮助中心入口](https://ecloud.10086.cn/op-help-center/doc/category/1456) | 无法安全打开/抓取 | 仅检索线索，未取得政策正文 |
| [中国移动官方 2025 中期业绩材料](https://www.chinamobileltd.com/en/ir/webcasts/pre250807a.pdf) | 抓取返回 403 | 搜索出现 MoMA 产品线索，不能用搜索摘要证明保留/训练事实 |

第三方博客、论坛与无关同名 MoMA 产品没有作为批准依据。没有把访问失败解释为厂商违反政策或不存在政策。

| MoMA API 处理事实 | 状态 | 依据/缺口 |
| --- | --- | --- |
| 请求、响应内容保留及期限 | UNKNOWN | 未取得适用 API 的官方条款正文 |
| 输入/输出用于训练或改进 | UNKNOWN | 未取得肯定或否定的可靠承诺 |
| 适用数据处理条款、主体及范围 | UNKNOWN | 缺正文、版本及适用范围 |
| 日志、滥用监测及期限 | UNKNOWN | 未确认 |
| 数据处理/存储地域 | UNKNOWN | 未确认；域名或运营主体不能证明地域 |
| 子处理者、模型第三方转交 | UNKNOWN | 未确认 |
| 删除与保留机制 | UNKNOWN | 未确认 |

`VERIFIED` 处理事实：无。`NOT_APPLICABLE`：无，不把未知误写成不适用。

`MOMA_BUSINESS_CONTEXT_RELEASE=BLOCKED_UNVERIFIED_PROCESSING`。
`store=false` 只说明客户端发了该字段，不证明零保留、不训练或服务端可靠遵循参数。

## 通用 Profile 与发布机制

`src/server/agent/provider-data-policy.ts` 保存经审阅的版本化服务器目录。每个 Profile 绑定稳定 ID、名称、版本、明确协议列表、完整 base URL identity（包含路径，严格字符串相等）、证据检查日期、链接，以及上述七类事实。绑定源于显式配置，不按 host/model 自动选择。

目录当前唯一 Profile `china-mobile-cloud-moma`，版本 `2026-09-08-unverified-v1`，endpoint identity `https://moma.cmecloud.cn/v1`，协议列表 `responses` / `chat_completions` 仅是配置绑定范围，**不表示任何协议能力或数据处理已获批准**。

批准须通过审阅修改服务器目录：`businessContextReleaseStatus=APPROVED`，保留、训练用途、适用处理条款均为 `VERIFIED` 且附证据链接，并明确判断其内容可接受。记录 UNKNOWN 的其他事项也须由发布审阅确认是否构成额外阻断；不可只为通过布尔检查改状态。Profile 的实质变更必须增版本，并更新本站隐私文案/处理政策。没有 HTTP 管理批准接口、环境变量任意 Profile、私网信任开关或风险自担 bypass。

`egress-test-support.ts` 中 approved profile 是 `.invalid` 的离线测试 fixture，不在目录中，不被产品入口导入。

## 两层批准

1. Operator：Agent enabled；独立 business egress 开关 enabled；显式 Profile 存在并批准；endpoint、protocol、Profile version 精确匹配；本站 Privacy 和 Egress policy 部署版本匹配当前代码。
2. User：服务端 Session 用户的独立 Consent 当前有效，绑定 consent/privacy/provider/profile/egress 五个版本字段，未撤回。

客户端不能提供 actor、endpoint、classification、approved 或 release status。即使用户同意 MoMA，也不能绕过本轮的 Provider 阻断。

下一最小任务仅为补足 MoMA API 保留、训练/改进用途及适用数据处理条款的官方证据；包括条款主体、版本、API 范围和具体限制，再决定是否满足批准条件。此项不授权真实请求或 M4。

## 2026-09-09 续作核验

本次再次只读尝试 MoMA 官方平台和中国移动云门户：前者抓取工具拒绝打开，后者返回 502。官方域名检索没有取得适用于 MoMA API 请求内容的保留、训练/改进和处理条款正文；会议、云盘、其他移动产品的政策不能替代 MoMA API 证据。没有访问 `/models` 或推理接口。此结果只说明本次未取得充分证据，不说明官方没有政策。Profile 保留原 2026-09-08 未核实版本；全部处理事实继续 UNKNOWN，批准状态不变。
