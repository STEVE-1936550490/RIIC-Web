# M3 本地演示与验收操作

当前交付是安全只读 PoC：四个工具、共享 Loop/API/右侧面板及两个显式协议适配器。真实模型验收本轮未授权、未执行；真实业务上下文外发仍为 `BLOCKED_PRIVACY`。演示使用确定性语法，不代表任意自然语言或真实模型智能已验证。

## 隔离副本及质量门禁

前提：当前仓库已有 Node 22、锁定依赖和 Playwright Chromium。下面不安装依赖、不读取 `.env`、不复制真实数据、不调用模型。复制器包含 tracked 和未忽略 untracked 文件的**当前内容**，排除 AGENTS、配置与数据，并复制现有依赖；保留相对依赖链接。磁盘需容纳一份依赖和构建产物。

在仓库根目录执行：

```bash
node scripts/agent-offline-command.mjs test
node scripts/agent-offline-command.mjs golden
node scripts/agent-offline-command.mjs typecheck
node scripts/agent-offline-command.mjs check
git diff --check
riic_agent_copy=$(node scripts/create-agent-test-copy.mjs)
cd "$riic_agent_copy"
node scripts/agent-offline-command.mjs build
node scripts/agent-offline-command.mjs e2e
```

复制路径为新建的 `/tmp/riic-agent-closeout-*`；`.tmp/source-manifest.json` 记录各公开文件 SHA-256。修改源码后需创建新副本再验收；旧副本不能证明最新改动通过。不要把 build 命令直接移到原服务工作区。

| 隔离入口 | 实际命令 / 等价入口 |
| --- | --- |
| `test` | `npm run test:agent` |
| `golden` | `npm run test:agent:golden`（已包含在 Agent 总数中） |
| `typecheck` | 已安装 TypeScript 的 `tsc --noEmit`，等价 `npx --no-install tsc --noEmit` |
| `check` | `npm run check`，包含 lint、仓库卫生和原有回归 |
| `build` | `ACCOUNT_CLOUD_SYNC_ENABLED=1 npm run build -- --webpack` |
| `e2e` | `npm run test:e2e:agent` 使用的同一 Playwright 入口 |
| `demo` | `npm run demo:agent` 使用的同一有界交互演示 |

子进程环境显式构造，清除继承的模型配置、旧 opt-in、代理及凭据；HOME 指向副本下空测试目录，业务存储指向新建的外部临时目录。浏览器仅请求本轮 loopback 服务或拦截 fixture。两台测试服务分别为 development + fake、production + feature off，使用新选择的端口且禁止复用已有服务。生产 fake 仍由 API/配置测试验证为拒绝。

## 三个场景的浏览器演示

无图形界面的服务器先运行上面的 `e2e`：自动验收三个场景及运行中、停止、失败重试、来源、stale、关闭后迟到响应和生产关闭状态。

如本机已有可用图形会话，在**已构建副本**中执行：

```bash
node scripts/agent-offline-command.mjs demo
```

它启动本轮测试服务和独立 Chromium，装载 synthetic 工作台、打开右侧面板，并在 Playwright Inspector 暂停，供手动输入。Linux 需要已有可用 DISPLAY；不在服务器安装桌面、不索取或复制显示/登录凭据。本轮已验收无头浏览器路径，有头人工操作不是新增验收证据。

| 操作（在“问题”输入框发送） | fixture 预期呈现 |
| --- | --- |
| `summary` | `FAKE / TEST`、`shiftCount: 2`、不提供最优性证明；工具状态为 `current_plan.get_summary`，来源带 revision、sampledAt |
| `room trade_1 @0` | 房间 `trade_1`、零基班次 0；planned 为“贸易甲”，observed 为 unavailable；房间工具状态及当前上下文来源 |
| `list 同名方案` | 两个同名候选 `synthetic-left` / `synthetic-right`；不会凭标题选中 |
| `compare synthetic-left synthetic-right` | 使用刚返回的两个 ID；natural24h LMD 为 100 / 150，差值 50；来源包含两个 ID 和 updatedAt |

改变问题会隐藏旧答案并显示 `STALE_CONTEXT`；重新发送得到对应结果。切换第 2 班再打开面板也使旧结果失效。自动测试另外验证失败重试、停止运行和关闭后迟到响应；不要用任意文字测试模型智能，fixture 的兜底文本没有该含义。

**这个浏览器演示 mock 了 Agent 响应，只证明 UI。** 不应在此暂停页输入真实数据。后端确定性 fake 的支持语法是 `summary` / `解释当前方案`、`room <房间> [@零基班次]`、`list [标题]`、`compare <左ID> <右ID>`；其数据读取、授权与数字计算由 API 集成测试核验。比较必须先列出当前 actor 可访问的 ID，缺失/歧义/他人方案不猜补。

| 证据层 | 实际执行内容 | 不能证明的内容 |
| --- | --- | --- |
| `e2e/agent-poc.spec.ts` | 浏览器、工作台、mock Agent DTO、显示/取消/stale/feature off | 后端工具或真实模型推理 |
| `src/server/agent/m3-api.test.ts` | 实际 API handler → LocalDemoProvider → 真实四个 M2 工具，内存仓库/服务端 synthetic actor | HTTP 模型兼容或真实账户数据库 |
| `chat-completions.test.ts`、`responses-compatible.test.ts`、`compatible-smoke.test.ts` 等 | 安装的 SDK + mock HTTP 序列化 → 共享 Loop → 真实 M2，双协议/安全/事实/预算 | 真实端点 strict enforcement、供应商保留政策或任意问法 |

## 停止与清理

自动验收结束时 Playwright 关闭自己启动的两台服务及浏览器。有头演示在原终端按 Ctrl+C（或先 Resume 完成流程），入口把信号转交给 Playwright。只使用这个终端/入口管理本轮进程，不运行 killall、不停止既有端口或服务。

副本和新建 synthetic 临时存储默认保留供核查；进程退出后可按本轮打印的**确切副本路径**手动删除副本。不要用通配符批量删除 `/tmp`，不要清理原仓库。测试不会改写原工作区 `.next`、部署配置或生产数据。

## 后续真实 synthetic 验收（仅提供命令，本轮不执行）

需要用户另行明确授权目标 endpoint + protocol + model、模式和 HTTP 预算。基本验收最多 1 次尝试；full 单次运行最多 12 次（含失败），不是 basic 后自动追加 12 次。无重试、fallback、模型替换或追求 PASS 的重跑。缺配置/未 opt-in 为 0；basic 失败即停止。full 在 basic 成功后独立判断 strict/current/saved；认证/限流等终止后余项为 BLOCKED。

以下 Bash 示例域名刻意不可用，模型是占位值。只在另外授权后替换非秘密项；Key 用隐藏输入或安全注入，不写入参数或 Git。每次只选择一个命令；不要同时执行 basic/full。外层子 shell 退出后变量消失：

```bash
(
  export AGENT_MODEL_PROTOCOL=responses
  # Chat 使用：export AGENT_MODEL_PROTOCOL=chat_completions
  export AGENT_MODEL_BASE_URL='https://gateway.example.invalid/custom/v1'
  export AGENT_MODEL_ID='placeholder-model'
  export AGENT_MODEL_REASONING_CONTINUATION=none
  unset AGENT_MODEL_ALLOW_LOOPBACK_HTTP
  read -r -s -p 'Endpoint API key: ' AGENT_MODEL_API_KEY
  export AGENT_MODEL_API_KEY
  RUN_COMPATIBLE_AGENT_SMOKE=1 npm run smoke:agent:compatible -- --mode basic
  # 另行授权 full 时，用下面一行替换上一行，不连续执行两者：
  # RUN_COMPATIBLE_AGENT_SMOKE=1 npm run smoke:agent:compatible -- --mode full
)
```

统一入口只接受自己的 `RUN_COMPATIBLE_AGENT_SMOKE=1`。专项入口 `smoke:agent:responses` / `smoke:agent:chat-completions` 分别要求 `RUN_RESPONSES_AGENT_SMOKE=1` / `RUN_CHAT_COMPLETIONS_AGENT_SMOKE=1`，并拒绝协议不符；同样支持两个模式、默认 basic。旧 OpenAI smoke 只给迁移提示，不会启用新协议。

只运行内置 synthetic actor、内存仓库及真实 M2；普通业务 API 不能通过页面参数变成 synthetic。记录代码 SHA、未提交补丁标识、mode、stage、请求计数、HTTP 状态、安全分类及 capability 结果；不要归档原始请求/响应、Key、完整端点或隐藏推理。usage 缺失为 unavailable，reported model 只是端点声明，单次 PASS 不证明普遍 strict enforcement。`store=false` 不表示供应商零保留或不训练。

真实端点验收和业务隐私放行分别授权，均不由本地工程 COMPLETE 自动获得。MoMA 历史两次验收、8 次 HTTP 尝试及 UNRESOLVED 根因保留在 [状态文档](implementation-status.md)。

## 2026-09-08 兼容补丁离线复核

现有 synthetic 入口已接入 `--chat-legacy-compat` 和三个有上界的超时参数；不依赖临时 broker，不读取旧 `ACCEPTANCE_*` 环境变量。普通测试继续通过显式环境 wrapper 执行。完整字段、解析差异和历史证据限制见 [兼容说明](compatible-provider.md)。此处不提供或运行新的真实端点命令；历史 26/100 不是调用授权。

共享 Chat adapter、Loop 和房间工具均被 Agent API 依赖，影响服务端打包链，因此本轮需要最终源码的隔离 cloud-enabled webpack build 和 Agent E2E，不能仅以没有 UI 修改跳过。浏览器测试仍仅证明 mock UI；后端与协议验证由实际 M2 + mock HTTP 回归证明。
