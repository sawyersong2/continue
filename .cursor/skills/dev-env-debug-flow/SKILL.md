---
name: dev-env-debug-flow
description: >-
  bk-cds 需求开发完成后的开发环境发布闭环：询问是否提交当前分支、用工蜂 MCP 创建合入 develop 的 MR 并给出链接，
  人工确认合并后再触发蓝盾流水线；projectId bkci-desktop，pipelineId p-00202cdb05ff49d3ba0fe3c3995f1d58，
  根据变更文件路径推断待发布的 services，必要时用 build_startInfo 校对参数格式。
  在用户表示「需求做完了」「可以合 develop」「触发生产/开发环境 JAVA 流水线」或主动执行本 skill 时使用。
---

# 开发环境调试发布闭环（需求完成后）

## 何时启用

- 关联需求的代码改动已在当前分支完成，准备进入 **develop** 并走 **【开发测试环境】云桌面后台发布-JAVA** 流水线。
- 用户希望：**可选本地提交 → 工蜂 MR → 人工合并 → 自动推断 services → 触发构建**。

## 固定常量（与本仓库约定）

| 项              | 值                                                              |
| --------------- | --------------------------------------------------------------- |
| 蓝盾 projectId  | `bkci-desktop`                                                  |
| 蓝盾 pipelineId | `p-00202cdb05ff49d3ba0fe3c3995f1d58`                            |
| MR 目标分支     | `develop`                                                       |
| 工蜂仓库 path   | 从 `git remote get-url origin` 解析（通常为 `bkdevops/bk-cds`） |

调用 **任何 MCP 工具前**，先在对应 MCP 目录读取工具 JSON 描述，确认参数名与必填项（工蜂：`mcps/user-gongfeng/tools/`；蓝盾：`mcps/user-devops-prod-pipeline-streamable/tools/`）。

## 执行流程（严格顺序）

复制下列清单跟踪进度：

```
[ ] 1. 确认 Git 状态与当前分支
[ ] 2. 询问：是否提交当前未提交改动（若需要则 git add / commit，文案与用户规范一致）
[ ] 3. 询问：是否创建 MR（源分支=当前分支，目标=develop）
[ ] 4. push 源分支到工蜂（若远端尚无提交）
[ ] 5. 工蜂 MCP：create_merge_request → 向用户展示 MR 链接与 IID
[ ] 6. 暂停：等待用户手动完成 MR 评审与合并
[ ] 7. 用户确认「MR 已合并」→ 可选用工蜂 search_merge_request state=merged 复核
[ ] 8. 推断 services → 必要时 build_startInfo 校对 MULTIPLE 传参格式
[ ] 9. build_start 触发流水线 → 按需 build_status 直到终态
```

### 1. Git 与提交（可选）

- 展示 `git status`、`git branch --show-current`。
- **询问**：是否将当前改动提交到当前分支。用户同意后再执行 commit；提交说明遵循仓库惯例（如 conventional commits / TAPD 关键字）。

### 2. 创建 MR（可选）

- **询问**：是否创建指向 `develop` 的 MR。
- 若同意：`git push -u origin <当前分支>`（若需要）。
- 使用 **工蜂 MCP** `create_merge_request`：`project_id` 用工蜂路径；`source_branch` / `target_branch`=`develop`；`title` / `description` 概括需求；若用户提供了 TAPD 信息，按工具可选字段填入 `tapd_*` / `tapd_info`。
- 将 MCP 返回中的 **MR Web URL**（及 **IID**）原文给用户；说明：**合并须用户在工蜂/评审流程中手动完成**，助手不得假定已合并。

### 3. 人工闸：合并确认

- 明确暂停，提示用户去 MR 页面完成合并。
- 用户回复「已合并」后，建议调用 **工蜂 MCP** `search_merge_request`（`project_id` + `iid` 或源分支 + `state=merged`）做一次状态校验；失败则以用户为准并提示自行核对。

### 4. 推断 `services`（动态）

以下适用于 **本仓库 `bk-cds` 单仓**路径（Gradle `boot-*` 镜像名规则：`boot-` 前缀与 `-tencent` 后缀去掉后为流水线 service 名）。

**路径前缀 → service**

| 变更路径前缀                                                                  | services 取值 |
| ----------------------------------------------------------------------------- | ------------- |
| `src/backend/cds/core/scheduler/` 或 `src/backend/cds/ext/tencent/scheduler/` | `scheduler`   |
| `src/backend/cds/ext/tencent/engine/`                                         | `engine`      |
| `src/backend/cds/ext/tencent/report/`                                         | `report`      |
| `src/backend/cds/ext/tencent/cgsagent/`                                       | `cgsagent`    |
| `src/backend/cds/ext/tencent/config/`                                         | `config`      |
| `src/backend/cds/ext/tencent/ai/`                                             | `ai`          |
| `src/backend/cds/ext/tencent/link/`                                           | `link`        |

**规则**

1. 收集「将进入 develop 的变更」涉及的文件路径：优先 **MR 合并后的 diff**（工蜂 `get_merge_request_changes` `diff_file_only=true`，注意工具参数里是 merge_request **数字 id** 而非 IID）；若不可用，则用本地 `git fetch origin develop && git diff origin/develop --name-only`（在用户已更新本地 develop 的前提下）或对合并提交的 `git show --name-only --pretty=`。
2. 按上表映射为 service **集合**（去重）。
3. **共享 / 构建级改动**（命中任一即不能只猜单一 service）：`src/backend/cds/core/common/`、`src/backend/cds/buildSrc/`、`src/backend/cds/build.gradle.kts`、`src/backend/cds/settings.gradle.kts`、`src/backend/cds/gradle.properties`、`src/backend/cds/core/common/**` 等——向用户列出「受影响的全套候选 Java services」或与用户确认需要发布的列表，**禁止在未确认时仅选一个**。
4. **`src/console/`、`src/schedule-mcp/`** 等不在上表：本次 JAVA 流水线可能不适用或需单独流程；向用户说明，勿写入错误的 `services`。

### 5. 触发流水线

1. 调用 **蓝盾 MCP** `build_startInfo`（`projectId` + `pipelineId`），核对 **`services`** 控件类型（如 MULTIPLE）及允许的枚举值。
2. **tag 继承规则（强制）**：`tag` 不能使用 `build_startInfo` 的 `defaultValue`。触发前必须通过 `build_list` 找到最近一次有效构建，再用
   `build_status` 读取其 `buildParameters` 中 `tag.value`，本次触发继承该实际值。若最近一次是本轮误触发或失败构建，应向前取上一条成功/有效构建；若无法读取
   `tag.value`，停止并向用户报告，**禁止猜测 tag**。
3. 调用 **`build_start`**：`path_param.projectId`、`query_param.pipelineId` 使用本节常量；`body_param` 必须包含非空的 **`services`**
   和上一步继承到的 **`tag`**。其它必要参数优先继承最近一次有效构建的 `buildParameters.value`，只替换本次需要变化的 `services` /
   `BK_CI_BUILD_MSG` 等字段；格式以 `build_startInfo` 与首次报错为准（常见为单个字符串或多选拼接；若 400，调整重试并记录 request_id）。
4. 若用户需要持续关注结果：轮询 **`build_status`**（`buildId`）直至终态。

## 异常与安全

- **禁止**在 MR 未合并或用户未确认的情况下触发 `build_start`。
- **禁止**把数据库密码、内网 URL、`e.message` 等敏感信息粘贴到对话或外部系统以外的界面；MR 描述沿用用户已脱敏的摘要。
- 仅修改 **cds-config** 等 **另一工蜂仓** 时，本 skill 的「路径 → services」表不适用；需单独确认流水线行为。

## 与其它约定的关系

- **优先委派 `dev-env-publisher` subagent** 执行本 skill 全流程（commit → MR → 触发流水线）。主智能体只需把阶段（`create_mr` / `verify_and_build`）、必要参数（commit message、services 范围、MR IID 等）告诉 subagent；除非用户明确要求主智能体亲自一步步执行，否则不要自己跑命令重复 subagent 的能力。
- 需求文档、TAPD 同步仍遵循 `.cursor/rules/tapd-requirement-sync.mdc` 与 `new-requirement` skill；本 skill 只管 **合 develop + 开发环境 JAVA 流水线** 这一段。
- 文档类同步不归本 skill 覆盖；若需更新 progress/requirements，按项目 workflow 执行。
