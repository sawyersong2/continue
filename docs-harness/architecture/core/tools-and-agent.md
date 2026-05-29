# Agent 工具系统（Tools）

> 模块：`core/tools/`

## 1. 职责

定义 Agent 可调用的内置 / MCP / HTTP 工具，负责工具 schema、参数解析、执行策略与 `callTool` 执行实现。

| 文件                                             | 职责                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `callTool.ts`                                    | 统一入口：`callTool` / `callBuiltInTool` / MCP(`mcp://`) / HTTP    |
| `builtIn.ts`                                     | 内置工具名枚举；`CLIENT_TOOLS_IMPLS`（在 GUI 客户端执行的工具）    |
| `definitions/*.ts`                               | OpenAI function schema + 元数据                                    |
| `implementations/*.ts`                           | 各工具实现（多数经 `extras.ide`）                                  |
| `index.ts`                                       | `getBaseToolDefinitions()` / `getConfigDependentToolDefinitions()` |
| `systemMessageTools/interceptSystemToolCalls.ts` | 模型不支持 native tools 时，从 markdown 代码块解析 tool call       |

## 2. 一次 Agent 工具调用的端到端链路

关键设计：**`llm/streamChat` 只产生 tool call（不执行工具）**；执行由 GUI 在流结束后按策略发起。

```mermaid
flowchart TD
  A[GUI streamNormalInput] --> B["llm/streamChat (带 tools)"]
  B --> C["model.streamChat → 流式 Assistant 消息 (含 toolCalls)"]
  C --> D[Redux 累积 tool call + 策略评估]
  D --> E{工具类型}
  E -->|CLIENT_TOOLS_IMPLS| F["GUI 客户端执行 (edit_existing_file / multi_edit 等)"]
  E -->|其它| G["ideMessenger.request(tools/call)"]
  G --> H[Core.handleToolCall → callTool]
  H --> I{tool.uri}
  I -->|built-in| J["callBuiltInTool → *Impl(extras.ide, ...)"]
  I -->|mcp://| K[MCPManagerSingleton.client.callTool]
  I -->|http(s)://| L[POST 远程工具]
  J --> M[结果写入 history]
  K --> M
  L --> M
  F --> M
  M --> N[streamResponseAfterToolCall 继续对话]
```

`Core.handleToolCall`（`core/core.ts`）构造 `extras`（`config`、`ide`、`llm`、`fetch`、`onPartialOutput` → `messenger.send("toolCallPartialOutput")`、`codeBaseIndexer`），交给 `callTool`。需要宿主能力时，implementation 用 `extras.ide.readFile` 等，经协议回调到扩展宿主。

## 3. 内置工具（节选）

| 工具名                                                          | 实现                           | 说明                                      |
| --------------------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| `read_file` / `read_file_range` / `read_currently_open_file`    | `implementations/readFile*.ts` | 经 IDE 读文件                             |
| `create_new_file` / `create_rule_block`                         | —                              | 写文件                                    |
| `grep_search` / `file_glob_search` / `ls`                       | —                              | 搜索 / 列目录                             |
| `run_terminal_command`                                          | `runTerminalCommand`           | IDE 终端 + 后台进程状态                   |
| `search_web` / `fetch_url_content`                              | —                              | 网络（web search 仅登录用户）             |
| `view_diff` / `codebase` / `view_repo_map`                      | —                              | 部分需 experimental                       |
| `edit_existing_file` / `single_find_and_replace` / `multi_edit` | **无 Core impl**               | 在 GUI 客户端执行（`CLIENT_TOOLS_IMPLS`） |

MCP 工具：`encodeMCPToolUri` → `mcp://{id}/{toolName}`，经 `MCPManagerSingleton` 调用。

## 4. 工具调用的两种来源

- **Native function calling**：模型直接返回 `toolCalls`
- **System message tools**：模型不支持 native tools 时，`interceptSystemToolCalls` 从 markdown 代码块解析出 tool call（在 GUI 侧）

## 5. 设计模式

| 模式               | 体现                                                           |
| ------------------ | -------------------------------------------------------------- |
| 策略               | `callBuiltInTool` 的 switch；URI 分支（built-in / mcp / http） |
| 工厂（防重复注册） | `getBaseToolDefinitions()` 每次返回新数组                      |
| Adapter            | `extras.ide` 把工具副作用桥接到宿主能力                        |

## 6. 对外依赖

`IDE`（文件 / 终端 / 搜索）、`MCPManagerSingleton`（MCP 工具）、`core/llm`（部分工具调 LLM）、`core/indexing`（`codebase` 工具）、`config.tools`（运行时工具集，含 MCP 注入）。
