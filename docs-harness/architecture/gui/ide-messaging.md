# GUI ↔ Core/IDE 通信（IdeMessenger）

> 模块：`gui/src/context/IdeMessenger.tsx`、`gui/src/hooks/useWebviewListener.ts`、`gui/src/hooks/ParallelListeners.tsx`
> 协议定义在 `core/protocol/`，桥接在 `extensions/vscode/src/webviewProtocol.ts` 与 `VsCodeMessenger.ts`。

## 1. IdeMessenger

`IdeMessenger`（implements `IIdeMessenger`）是 GUI 与扩展/Core 通信的唯一出口，通过 Webview 的 `postMessage` 收发消息。

| 方法                                | 语义                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `request(type, data)`               | `postMessage({ messageId, messageType, data })`，注册 `window.message` 监听按 `messageId` 收**单次** `{ status, content \| error }` |
| `streamRequest(type, data, signal)` | 同一 `messageId` 收**多个** `{ done, content }` 分片；`signal` 触发时 `post("abort", undefined, messageId)`                         |
| `llmStreamChat(...)`                | `streamRequest("llm/streamChat", ...)` 的薄封装                                                                                     |
| `ide`                               | `MessageIde` 实例，把 IDE 能力（readFile 等）再映射为 `request`                                                                     |
| `post(type, data, messageId?)`      | 底层单向发送                                                                                                                        |

宿主差异：VS Code 用 `acquireVsCodeApi().postMessage`；JetBrains 用 `window.postIntellijMessage`。

`IdeMessengerContext` 默认值即 `new IdeMessenger()`，全局可用；测试用 `util/test/render.tsx` 注入 `MockIdeMessenger`。

## 2. 协议分层与 passThrough

GUI 用到的协议（`core/protocol/index.ts`）：

- `FromWebviewProtocol = ToIdeFromWebviewProtocol ∪ ToCoreFromWebviewProtocol`
- `ToWebviewProtocol`（GUI 接收）= IDE→Webview ∪ Core→Webview

`core/protocol/passThrough.ts` + `VsCodeMessenger.ts` 决定哪些消息直接转发：

| 方向                             | 代表消息                                                                                                                                                                     | 转发目标                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Webview → Core**               | `llm/streamChat`、`llm/compileChat`、`context/getContextItems`、`tools/call`、`tools/evaluatePolicy`、`tools/preprocessArgs`、`config/getSerializedProfileInfo`、`history/*` | `inProcessMessenger.externalRequest` → Core 的 `on` handler |
| **Core → Webview**               | `configUpdate`、`sessionUpdate`、`toolCallPartialOutput`、`indexing/statusUpdate`、`addContextItem`、`updateApplyState`                                                      | `webviewProtocol.request` → 扩展 `postMessage` 到 GUI       |
| **IDE 专有**（不经 passThrough） | `showFile`、`edit/sendPrompt`、`getControlPlaneSessionInfo`、`navigateTo`                                                                                                    | `VsCodeMessenger.onWebview` 直接处理                        |

扩展侧 `webviewProtocol.ts`：若 handler 返回 **AsyncGenerator**（如 `llm/streamChat`），则多次 `respond({ done:false, content })`，最后 `{ done:true }`——这正是 GUI `streamRequest` 收分片的对端。

## 3. GUI 监听 Core 推送

`hooks/useWebviewListener.ts`：监听某 `messageType`，handler 执行后 `ideMessenger.respond(messageType, result, messageId)`。`hooks/ParallelListeners.tsx` 集中注册全局监听（返回空 fragment，隔离重渲染）。

| 推送消息                | 监听位置            | 行为                           |
| ----------------------- | ------------------- | ------------------------------ |
| `configUpdate`          | `ParallelListeners` | 更新 `config`/`profiles` slice |
| `toolCallPartialOutput` | `Chat.tsx`          | `updateToolCallOutput`         |
| `sessionUpdate`         | `Auth.tsx`          | 更新 control plane session     |
| `indexing/statusUpdate` | `ParallelListeners` | `updateIndexingStatus`         |
| `updateApplyState`      | `ParallelListeners` | `handleApplyStateUpdate`       |
| `addContextItem`        | `ParallelListeners` | `addContextItemsAtIndex`       |

## 4. 典型请求一览

| 能力      | GUI 调用                                     | 协议键                    | 触发位置                  |
| --------- | -------------------------------------------- | ------------------------- | ------------------------- |
| 流式 Chat | `ideMessenger.llmStreamChat(...)`            | `llm/streamChat`          | `streamNormalInput.ts`    |
| 上下文    | `request("context/getContextItems", ...)`    | `context/getContextItems` | `resolveEditorContent.ts` |
| 工具执行  | `request("tools/call", ...)`                 | `tools/call`              | `callToolById.ts`         |
| 配置      | `request("config/getSerializedProfileInfo")` | 同名                      | `ParallelListeners`       |
| 应用 diff | `streamRequest("streamDiffLines", ...)`      | `streamDiffLines`         | apply / edit              |

## 5. 扩展侧加载

| 产物                                | 加载方（viewType）                                                     |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `gui/assets/index.js` + `index.css` | `ContinueGUIWebviewViewProvider`（`continue.continueGUIView`）         |
| `gui/assets/indexConsole.js`        | `ContinueConsoleWebviewViewProvider`（`continue.continueConsoleView`） |
| 开发态                              | Vite `localhost:5173`，扩展 HTML 直接引 `main.tsx` / `console.tsx`     |
