---
name: tapd-requirement-branch
description: 自动提交 TAPD BKW 需求并创建开发分支的 bk-cds 工作流。只要用户要新建需求、提交 TAPD、同步 TAPD 状态、根据 TAPD 需求单号创建 story 分支、或把 new-requirement 与 TAPD 分支流程串起来，都应优先使用本 skill；它会创建/更新 docs-harness/requirements 文档、调用 TAPD MCP，并按 Story ID 自动生成 story_xxxxxxxxx 开发分支。
---

# TAPD Requirement Branch — 需求建单与开发分支自动化

## 目标

把以下动作整合成一个可在 OpenClaw 中直接执行的单一工作流：

1. 创建或补齐 `docs-harness/requirements/NNN-name/` 需求文档三件套；
2. 自动在 TAPD BKW 项目创建需求单，或复用用户提供的 TAPD Story ID；
3. 根据 TAPD Story ID 自动创建开发分支；
4. 将 TAPD ID、TAPD 链接、开发分支、需求状态同步回本地文档；
5. 在关键阶段用 TAPD skill 同步需求状态。

## 触发场景

当用户表达以下意图时使用本 skill：

- “新建需求并提 TAPD”
- “自动提交 TAPD 需求”
- “根据需求单号创建开发分支”
- “把 TAPD 建单和分支创建串起来”
- “开始一个需求，帮我建 docs、TAPD 和 story 分支”
- “同步 TAPD 状态并更新需求文档”

## 固定参数与约定

| 项             | 值                                                             |
| -------------- | -------------------------------------------------------------- |
| TAPD 项目      | BKW                                                            |
| `workspace_id` | `69990282`                                                     |
| TAPD 标题前缀  | `【云桌面后台】`                                               |
| TAPD 链接格式  | `https://tapd.woa.com/tapd_fe/69990282/story/detail/<storyId>` |
| 默认分支名前缀 | `story_`                                                       |
| 分支名生成规则 | `story_` + TAPD Story ID 后 9 位                               |

示例：

- TAPD Story ID：`1069990282134075630`
- 开发分支：`story_134075630`

## 输入识别

先从用户消息和已有文档中提取信息，不足时再询问。

### 必需信息

- **需求中文短标题**：用于 TAPD 标题，格式为 `【云桌面后台】<中文短标题>`。
- **需求目录名**：使用 kebab-case，例如 `proxy-tag-free-filter`。
- **需求简述**：用于需求文档和 TAPD 描述。

### 可选信息

- **已有 TAPD Story ID**：若用户已提供 19 位 Story ID，则不重复创建 TAPD，仅校验并创建分支。
- **基础分支**：用户可指定 `master`、`main`、`develop` 或当前分支；未指定时按“分支创建流程”判断。
- **需求状态**：默认 `规划中`，开始编码时更新为 `开发中`。

## 工作流

### 1. 预查项目文档

执行任何修改前先检查：

1. 读取 `docs-harness/progress.md`，理解当前项目状态；
2. 读取 `docs-harness/requirements/README.md`，确认最大需求编号并避免重复；
3. 若已有相关 `docs-harness/requirements/NNN-*`，读取其中的 `requirements.md`、`solution.md`、`task-items.md`；
4. 若当前任务只是为已有 TAPD Story 创建分支，可跳过新建三件套，但仍要回写已有需求文档中的分支信息。

### 2. 创建或补齐需求文档

如果不存在对应需求文档：

1. 从 `docs-harness/requirements/README.md` 中取最大编号，分配下一个三位数编号；
2. 创建 `docs-harness/requirements/NNN-name/`；
3. 创建三件套：
   - `requirements.md`
   - `solution.md`
   - `task-items.md`
4. 更新 `docs-harness/requirements/README.md` 索引；
5. 更新 `docs-harness/progress.md` 当前状态。

`requirements.md` 顶部元数据应包含：

```markdown
> 编号: NNN
> 状态: 规划中
> 创建日期: YYYY-MM-DD
> TAPD Story ID: （待创建）
> TAPD 链接: （待创建）
> 开发分支: （待创建）
```

如果已有需求文档但缺少上述字段，只补齐缺失字段，不重写正文。

### 3. 创建或复用 TAPD Story

优先使用用户提供或文档中已有的 TAPD Story ID。

如果没有 TAPD Story ID：

1. 使用已配置的 TAPD MCP 创建需求；
2. `workspace_id` 固定为 `69990282`；
3. `name` 使用 `【云桌面后台】` + 需求中文短标题；
4. `description` 至少包含：
   - 本地路径：`docs-harness/requirements/NNN-name/`
   - 需求编号：`NNN`
   - 需求背景/目标摘要
   - 主要验收标准或任务摘要

OpenClaw 中可用 TAPD MCP 时，按当前客户端提供的 MCP 入口执行：

- 若提供 `tapd` MCP 直接工具，调用 `stories_create`；
- 若提供代理型 MCP，先查询 `stories_create` 参数 schema，再执行 `stories_create`；
- 不确定状态枚举时，调用 `tapd_field_detail_get` 查询 `object_type=story`、`field=status`。

创建成功后从响应中提取 19 位 Story ID。若 MCP 不可用或调用失败：

1. 不阻塞本地文档创建；
2. 在 `docs-harness/progress.md` 或对话中记录“待补 TAPD”；
3. 不创建 story 分支，除非用户提供了有效 Story ID。

### 4. 生成开发分支名

校验 Story ID 必须是 19 位数字。

分支名算法：

```text
branchName = "story_" + storyId.takeLast(9)
```

示例：

```text
storyId = 1069990282134075630
branchName = story_134075630
```

如果团队或用户明确指定其他分支名，使用用户指定值，但仍在文档中记录实际分支名。

### 5. 创建开发分支

创建分支前先执行安全检查：

1. 检查当前仓库是否为 Git 仓库；
2. 执行 `git status --short` 查看工作区；
3. 若工作区有未提交改动，先提示风险；只有用户明确要求继续时才在脏工作区切分支；
4. 检查分支是否已存在：
   - 本地存在：切换到该分支；
   - 远端存在：拉取并跟踪远端分支；
   - 都不存在：从基础分支创建。

推荐命令顺序：

```bash
git status --short
git branch --list story_134075630
git ls-remote --heads origin story_134075630
git switch -c story_134075630
```

基础分支选择：

1. 用户指定基础分支时，先切到该分支并拉取最新代码；
2. 用户未指定时，优先使用当前分支作为基础分支；
3. 若当前分支明显不是主干且用户要求从主干创建，则使用仓库默认分支或项目约定主干。

注意：不要自动删除或重置用户本地改动。

### 6. 回写文档

创建或确认分支后，更新 `requirements.md` 顶部元数据：

```markdown
> TAPD Story ID: 1069990282134075630
> TAPD 链接: https://tapd.woa.com/tapd_fe/69990282/story/detail/1069990282134075630
> 开发分支: `story_134075630`
```

同时更新：

- `docs-harness/requirements/README.md`：在说明列补充 TAPD ID 与分支名；
- `docs-harness/progress.md`：当前进行中或待办里记录该需求和分支；
- 若状态进入开发，更新本地状态为 `开发中`。

### 7. 同步 TAPD 状态

在关键阶段主动同步 TAPD 状态，优先传内部状态码：

| 本地状态 | TAPD `status` | 使用时机                     |
| -------- | ------------- | ---------------------------- |
| 规划中   | `status_10`   | 创建后默认，一般不强制更新   |
| 开发中   | `status_3`    | 开始实质编码或创建开发分支后 |
| 测试中   | `status_4`    | 提测、联调或 MR 进入验证     |
| 已完成   | `status_8`    | 合并发布或验收完成           |
| 已取消   | `status_9`    | 需求废弃                     |

每次 TAPD 状态变化后，都要同步本地文档状态，避免 TAPD 与 `docs-harness/requirements` 两套状态漂移。

## 输出格式

完成后向用户简要汇报：

```markdown
- **TAPD**：<Story ID 与链接，或待补 TAPD 原因>
- **需求文档**：<docs-harness/requirements/NNN-name/requirements.md>
- **开发分支**：<branchName，说明是新建/复用/切换>
- **状态同步**：<本地状态与 TAPD 状态>
```

## 失败处理

- **TAPD skill 不可用**：继续创建本地需求文档，记录“待补 TAPD”，等待用户补充 Story ID 后再创建分支。
- **Story ID 无效**：停止分支创建，要求用户提供 19 位数字 ID。
- **分支已存在**：不要报错，切换或跟踪已有分支，并回写文档。
- **工作区有未提交改动**：先提示风险，不擅自 stash、reset 或 checkout 覆盖用户改动。
- **文档已存在**：只做增量补齐，不覆盖用户已写内容。

## 快速检查清单

执行结束前确认：

- [ ] `requirements.md` 有 TAPD Story ID、TAPD 链接、开发分支；
- [ ] `docs-harness/requirements/README.md` 索引已更新；
- [ ] `docs-harness/progress.md` 当前状态已更新；
- [ ] Git 当前分支是目标开发分支，或已明确说明未切换原因；
- [ ] 若 TAPD 已创建，状态与本地文档一致；
- [ ] 若 TAPD 未创建，已记录“待补 TAPD”。
