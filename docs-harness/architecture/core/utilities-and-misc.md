# 工具与杂项模块

> 模块：`core/util/`、`core/utils/`、`core/diff/`、`core/promptFiles/`、`core/codeRenderer/`、`core/continueServer/`、`core/deploy/`、`core/tag-qry/`、`core/vendor/`
> 这些是支撑各 AI 子系统的基础设施与资源目录。

## 1. `core/util/` —— 通用基础设施层

Continue Core 的「大杂烩工具箱」，约 76 个文件，按主题文件组织（**无统一 barrel export**，`util/index.ts` 自身只是一组字符串工具）。被全 monorepo 引用 200+ 处。

| 子域        | 关键文件                                                                                                                                                                                        | 职责                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 路径 / URI  | `paths.ts`、`uri.ts`、`pathToUri.ts`、`ideUtils.ts`、`pathResolver.ts`                                                                                                                          | Continue 全局目录、配置 / 索引 / SQLite 路径；URI 规范化与 workspace 内匹配；`pathToUri.ts` 标注**仅限 Core 使用** |
| 全局状态    | `GlobalContext.ts`                                                                                                                                                                              | 读写 `~/.continue/` JSON，持久化 profile 选择、sharedConfig、MCP OAuth、索引暂停等                                 |
| 会话        | `history.ts`（default `historyManager`）、`historyUtils.ts`、`chatDescriber.ts`、`conversationCompaction.ts`                                                                                    | 会话 CRUD（`sessions.json`）、导出 Markdown、生成标题、压缩会话                                                    |
| 消息        | `messageContent.ts`、`messageConversion.ts`                                                                                                                                                     | `ChatMessage` 渲染为纯文本；OpenAI ↔ Continue 统一格式互转                                                        |
| 遥测 / 日志 | `posthog.ts`（`Telemetry`）、`TokensBatchingService.ts`、`Logger.ts`、`sentry/*`                                                                                                                | PostHog 事件 / Feature Flag、token 批量上报、winston 日志 + Sentry（含脱敏）                                       |
| 解析        | `treeSitter.ts`、`handlebars/*`、`incrementalParseJson.ts`                                                                                                                                      | web-tree-sitter 初始化与符号提取；Handlebars 模板渲染；流式 JSON 解析                                              |
| 错误 / 重试 | `errors.ts`（`ContinueError` + `ContinueErrorReason`）、`isAbortError.ts`、`withExponentialBackoff.ts`                                                                                          | 结构化错误码、cancel 识别、LLM 429 退避                                                                            |
| 安全        | `sanitization.ts`、`ca.ts`、`shellPath.ts`                                                                                                                                                      | shell 注入防护、系统 CA 注入、读取用户 shell `$PATH`                                                               |
| 其它        | `parameters.ts`、`merge.ts`、`generateRepoMap.ts`、`ranges.ts`、`LruCache.ts`、`clipboardCache.ts`、`processTerminalStates.ts`、`tts.ts`、`ollamaHelper.ts`、`filesystem.ts`（`FileSystemIde`） | 默认参数常量、JSON 深合并、repo map、范围切片、LRU、终端进程状态、TTS、Ollama 检测、测试 / CLI 用文件系统 IDE      |

> 注意：`ast.ts` **不在** `util/`，而在 `core/autocomplete/util/ast.ts`（底层解析器来自 `util/treeSitter.ts`）。

## 2. `core/utils/` —— Markdown 流式处理（窄域）

只有 2 个源码文件，专门解决「LLM 流式输出在 **markdown 文件**里遇到嵌套 ``` 代码块时何时停止截断」：

| 文件                     | 符号                                                              | 职责                                                    |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `markdownUtils.ts`       | `isMarkdownFile`、`headerIsMarkdown`、`MarkdownBlockStateTracker` | 判断 markdown 文件 / fence 语言，带状态追踪的嵌套块分析 |
| `streamMarkdownUtils.ts` | `stopAtLinesWithMarkdownSupport`、`processBlockNesting`           | 对 `LineStream` 做 markdown 感知的「遇 ``` 停止」变换   |

仅被 autocomplete 行流过滤、`edit/lazy/streamLazyApply.ts` 与 GUI markdown 预览使用。

> **`util` vs `utils`**：仓库内无注释说明命名原因。结构上 `util/` 是历史大工具箱，`utils/` 是后加的窄域 markdown 流模块（与 `autocomplete/filtering/streamTransforms/`、`edit/lazy/` 形成垂直切片）。两者并非严格设计规范，使用时按上表区分即可。

## 3. `core/diff/` —— diff 算法层

统一产出 `DiffLine` 供 edit / apply / nextEdit / IDE 消费。`DiffLine` 主定义在 `core/index.d.ts`：

```ts
export type DiffType = "new" | "old" | "same";
export interface DiffLine extends DiffObject {
  line: string;
}
```

| 文件            | 符号                                                          | 职责                                                                             |
| --------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `myers.ts`      | `myersDiff`、`myersCharDiff`、`convertMyersChangeToDiffLines` | 基于 npm `diff` 包的**同步**全文 / 字符 diff                                     |
| `streamDiff.ts` | `streamDiff`                                                  | **异步生成器**：旧行数组 vs 新行流，逐行 yield `DiffLine`（模糊匹配 + 缩进修正） |
| `util.ts`       | `LineStream`、`matchLine`、`streamLines`、`generateLines`     | 行匹配（Levenshtein）、LLM chunk → 行流                                          |

两套算法的分工：

| 算法            | 场景                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `myersDiff`     | 已有完整新旧文本（如 search-replace instant apply、deterministic lazy apply、Next Edit 有效性判断） |
| `streamDiff`    | LLM **边生成边 diff**（`edit/streamDiffLines.ts`、`streamLazyApply.ts`）                            |
| `myersCharDiff` | Next Edit 窗口内字符级高亮（VS Code `NextEditWindowManager`）                                       |

> Next Edit 还有业务层 `core/nextEdit/diff/diff.ts`（`groupDiffLines`、`calculateFinalCursorPosition`），内部调用 `myersDiff`。流式 diff 用 `matchLine` 容忍 LLM 噪声，结果可能与严格 Myers 不同。

## 4. `core/promptFiles/` —— `.prompt` 文件机制

管理用户可编辑的 `.prompt` / `.md` 提示词文件，并转成内置 slash command。

| 文件                     | 职责                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `index.ts`               | 目录常量：`DEFAULT_PROMPTS_FOLDER_V1`（`.prompts`）、`DEFAULT_PROMPTS_FOLDER_V2`（`.continue/prompts`） |
| `parsePromptFile.ts`     | 按 `\n---\n` 拆 YAML 前言与正文，解析 `name`/`description`/`version`，可选 `<system>`                   |
| `getPromptFiles.ts`      | 扫描 workspace + `~/.continue/prompts` + rules 目录                                                     |
| `createNewPromptFile.ts` | `createNewPromptFileV2`：生成新 `.prompt`，首次带示例模板                                               |
| `initPrompt.ts`          | 内置 `/Init` slash command（生成 `CONTINUE.md`）                                                        |

链路：`getAllPromptFiles` → `parsePromptFile` → `commands/slash/promptFileSlashCommand.ts` 转 `SlashCommandWithSource` → 并入 `config.slashCommands`（v1 走 `prompt-file-v1`，v2 走 `prompt-file-v2`，正文用 `@` 引用）。`createNewPromptFileV2` 由 `config/newPromptFile` 消息触发。GUI 侧 `renderPromptv1/v2.ts` 负责渲染。

## 5. `core/codeRenderer/` —— 代码高亮转 SVG

单例 `CodeRenderer`（`CodeRenderer.ts`）：用 **Shiki** 语法高亮 → **JSDOM** 转 **SVG**（含 diff / 高亮标注），生成 data URI。仅服务 VS Code **Next Edit** 的 `NextEditWindowManager` 装饰显示，与 chat / indexing 主链路无关。Diff 通过 Shiki magic comment（`// [!code ++]`）实现，当前只产出 SVG。

## 6. `core/continueServer/` —— 托管服务客户端

Continue 托管服务的轻量 HTTP 客户端。

| 文件               | 职责                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `interface.ts`     | `IContinueServerClient`、`EmbeddingsCacheChunk`、`ArtifactType`（`chunks`/`embeddings`） |
| `stubs/client.ts`  | `ContinueServerClient` 实现                                                              |
| `stubs/headers.ts` | `getHeaders()`：请求通用头                                                               |

| 方法                                        | 行为                                           |
| ------------------------------------------- | ---------------------------------------------- |
| `getConfig()`                               | `GET {baseUrl}sync` 拉远程配置                 |
| `getFromIndexCache(keys, artifactId, repo)` | `POST {baseUrl}indexing/cache` 远程 chunk 缓存 |

与索引关系：`ChunkCodebaseIndex.update` 若 `connected` 先查远程 chunk 缓存，命中则写入 SQLite 跳过本地计算（仅 chunk artifact 调用）。失败时返回空，不抛致命错误。另被 VS Code `RemoteConfigSync`、Web/Docs 爬取（带 Continue 头）使用。

## 7. `core/deploy/` —— API header 常量（非部署）

**命名易误解**：不是部署脚本，只有 `constants.ts`（`constants`、`getTimestamp()`），为 `continueServer/stubs/headers.ts` 的 `getHeaders()` 提供 trial proxy 请求的 header 密钥源。

## 8. `core/tag-qry/` —— tree-sitter tag 查询资源

16 个语言的 tree-sitter tag query（`.scm`，`@definition.*` / `@reference.*`）。**`core/` 内无任何 TypeScript import**，是历史 / 预留的 ctags 风格符号查询资源（曾供已下线的 `@outline`/`@highlights`）。当前活跃的符号提取走 `extensions/vscode/tree-sitter/code-snippet-queries/`（`CodeSnippetsCodebaseIndex`、`generateRepoMap`），不是本目录。打包脚本会校验这些 `.scm` 存在。

## 9. `core/vendor/` —— vendored 第三方产物

集中存放 vendored 依赖与构建期二进制：

| 内容                            | 用途                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `modules/@xenova/transformers/` | transformers.js 源码，被 `TransformersJsEmbeddingsProvider` 动态 import 做本地 `all-MiniLM-L6-v2` 嵌入 |
| `tree-sitter.wasm`              | 与 `web-tree-sitter` 配合，由打包脚本复制到 `out/`                                                     |

vendor 原因（见 `vendor/README.md`）：正常安装 `@xenova/transformers` 会拉入未使用且带 native 绑定的 `sharp`，vendor 内嵌源码以规避。嵌入时 `env.allowRemoteModels = false`，`NODE_ENV=test` 返回 mock 向量。

## 10. 设计模式与约定

| 约定               | 体现                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| 文件持久化轻量对象 | `GlobalContext` 各处 `new`，读写同一 JSON（非经典单例）                                                     |
| 模块级单例 export  | `historyManager`、`clipboardCache`、`Logger`、`CodeRenderer.getInstance()`                                  |
| 静态类 + 注入      | `Telemetry`、`TTS`、`ChatDescriber`、`SentryLogger`（IDE 启动时注入 `ideInfo`/`messenger`）                 |
| 结构化错误         | 工具层抛 `ContinueError` + `ContinueErrorReason`，协议层把 reason 暴露给 GUI                                |
| 路径分层           | `paths`（OS）→ `pathToUri`（file URI，限 Core）→ `uri`（URI 逻辑）→ `ideUtils`/`pathResolver`（IDE 上下文） |
| Diff 类型统一      | 全链路 `{ type, line }`，流式与同步算法输出形状一致                                                         |
