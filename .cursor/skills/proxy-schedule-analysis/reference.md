# Proxy Schedule Analysis Reference

## 核心原则

- `Facts first`：先查调度分析 MCP，再决定是否补查 DB / 日志
- `On-demand deepening`：DB / 日志只在异常驱动时补查
- `Cross-source validation`：尽量用两类以上证据互相印证
- `No fake certainty`：证据不足时，明确标注为待验证
- `Explain with architecture`：涉及调度逻辑解释时必须使用 `schedule-architecture`

## 有效数据判定

满足以下条件时，才适合给出较强结论：

- 有明确的 `zone_id` 与时间窗口
- `schedule_overview`、`schedule_filter_funnel`、`schedule_rule_findings` 中至少两类结果可用
- 关键现象能被至少一类补充证据支撑，或已有规则发现与统计趋势互相印证

以下情况应降低结论强度：

- 请求量过低或统计明显不稳定
- 关键工具返回空结果、窗口数据缺失或口径不完整
- DB / 日志查询时间窗口与调度统计窗口无法对齐
- 只找到单点异常，没有形成跨来源证据闭环

## 推荐分析路径

### 第 1 步：建立事实基线

优先顺序：

1. `schedule_overview`
2. `schedule_top_profiles`
3. `schedule_filter_funnel`
4. `schedule_rule_findings`
5. 按需补 `schedule_tree_simulation`
6. 按需补 `schedule_proxy_distribution`

输出目标：

- 当前区域是否存在明显异常
- 问题更像是供给不足、过滤过窄、画像集中、随机选择还是链路异常
- 是否已经足够直接下结论

### 第 2 步：按异常信号分流

#### 适合直接收敛

- `schedule_rule_findings` 已给出高可信发现
- 树模拟、漏斗、画像、属性分布能互相印证

#### 适合补查 DB

- 怀疑区域 Proxy 数量、状态、运营商链路配置异常
- 怀疑 group 掩码、应用级白名单或用户级绑定导致候选变少
- 怀疑已有实例绑定、但没有走 `existing_assignment` 或 `observer_reuse`

#### 适合补查日志

- 怀疑实际运行时存在错误、超时、重试、投递失败
- 怀疑 Scheduler 到 CgsAgent 的调度推送链路异常
- DB 看起来正常，但线上行为与统计结果不一致

#### 适合补查架构说明

- 需要解释过滤器顺序、树维度、ZSet / DialScore / Telecom 过滤意义
- 需要解释调度结果推送链路与连接延迟投递机制

## 多维度分析框架

### 1. 调度统计维度

常见关注点：

- 请求总量是否异常
- `fresh_alloc` 是否异常偏高
- Top 画像是否过度集中
- 哪个过滤阶段丢失候选最多
- 是否存在树层级收敛过快
- 区域内 Proxy 分布是否失衡

主要来源：

- `schedule_overview`
- `schedule_top_profiles`
- `schedule_filter_funnel`
- `schedule_rule_findings`
- `schedule_tree_simulation`
- `schedule_proxy_distribution`

### 2. DB 状态维度

常见关注点：

- 资源是否真实存在且状态正常
- 配置是否限制了候选集
- 绑定关系是否使调度偏向少量实例或 Proxy
- 历史记录是否与当前统计方向一致

主要来源：

- `cds 数据查询 MCP`

### 3. 日志运行时维度

常见关注点：

- 是否存在异常峰值、错误码、超时、重试
- 调度推送是否失败
- 关键链路是否在异常窗口内出现报错

主要来源：

- `Bk-monitor 日志查询 MCP`

### 4. 架构逻辑维度

常见关注点：

- 为什么某个过滤器会执行或跳过
- 为什么某类请求会在特定树层级被收敛
- 为什么统计上看似正常，但运行时链路仍可能异常

主要来源：

- `schedule-architecture`

## 调度相关 DB 表地图

> 以下字段基于当前仓库代码、DAO 和数据对象整理。真实查询前，仍应确认 `cds 数据查询 MCP` 暴露的可查 schema 与字段名。

### 表总览

| 表名                   | 用途                            | 关键字段                                                                                                                                                                                                                                             | 适合排查的场景                                            |
| ---------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `t_proxy`              | 区域内 Proxy 基础信息与链路能力 | `proxy_id`, `zone_id`, `group_name`, `endpoint`, `inner_ip`, `status`, `status2`, `version`, `cvm_instance_id`, `endpoint_of_*`, `linktype_of_*`, `bandwith_limit`                                                                                   | 区域 Proxy 供给不足、运营商链路异常、状态异常             |
| `t_proxy_group`        | Proxy 分组与掩码控制            | `name`, `status`, `network_mask`, `clienttype_mask`, `devicetype_mask`, `tags`                                                                                                                                                                       | group 被禁用、设备/网络/客户端掩码过滤过严                |
| `t_proxy_zone_backup`  | 主区域与备份区域映射            | `primary_zone_id`, `backup_zone_id`, `priority`, `status`, `description`                                                                                                                                                                             | 主区域资源不足但未走 backup / degrade                     |
| `t_tree_level_defines` | 代理树层级定义                  | `define_id`, `define_name`, `tree_level`, `flags`, `search_field`, `compare_datatype`, `load_field`, `load_field_datatype`                                                                                                                           | 树层级强收敛、树维度解释                                  |
| `t_app_proxy`          | 应用到 Proxy 的准入配置         | `app_id`, `zone`, `inner_ip`                                                                                                                                                                                                                         | 某 app 候选 Proxy 特别少                                  |
| `t_user_proxy`         | 用户指定 Proxy 关系             | `user_id`, `resource_id`, `proxy_id`                                                                                                                                                                                                                 | 个别用户固定落到少数 Proxy                                |
| `t_user_app_cds`       | 用户 / 应用与实例绑定           | `user_id`, `app_id`, `bcs_env_id`, `cgs_id`, `status`, `external_order_id`, `resource_id`                                                                                                                                                            | 绑定未复用、`existing_assignment` / `observer_reuse` 异常 |
| `t_cds_info`           | CDS 当前主表                    | `server_id`, `cds_id`, `status`, `zone_id`, `inner_ip`, `version`                                                                                                                                                                                    | CDS 归属区域、状态、实例映射异常                          |
| `t_cgs_server`         | 旧 CGS 兼容表                   | `server_id`, `bcs_env_id`, `status`, `zone_id`, `inner_ip`, `version`                                                                                                                                                                                | `oldCgsId` / 老 ID 兼容链路排查                           |
| `t_schedule_history`   | 调度历史记录                    | `user_id`, `project_id`, `cds_id`, `old_cgs_id`, `proxy_endpoint`, `session_id`, `status`, `error_code`, `error_message`, `cost_time_ms`, `schedule_mode`, `is_observer`, `client_ip`, `client_version`, `client_type`, `device_type`, `create_time` | 失败率、错误码、耗时、调度模式异常                        |

### 重点表说明

#### `t_proxy`

重点看：

- `zone_id`：确认 Proxy 是否属于目标区域
- `status` / `status2`：确认是否处于可调度状态
- `group_name`：后续联动 `t_proxy_group`
- `endpoint_of_telecom` / `endpoint_of_unicom` / `endpoint_of_mobile` / `endpoint_of_bgp`
- `linktype_of_telecom` / `linktype_of_unicom` / `linktype_of_mobile` / `linktype_of_bgp`
- `bandwith_limit`

适合联动：

- `t_proxy_group`
- `t_proxy_zone_backup`

#### `t_proxy_group`

重点看：

- `status`：group 是否启用
- `network_mask`
- `clienttype_mask`
- `devicetype_mask`
- `tags`

适合联动：

- `t_proxy`
- `t_tree_level_defines`

#### `t_proxy_zone_backup`

重点看：

- `primary_zone_id`
- `backup_zone_id`
- `priority`
- `status`

适合联动：

- `schedule_rule_findings`
- `schedule_tree_simulation`

#### `t_tree_level_defines`

重点看：

- `define_name`
- `tree_level`
- `flags`
- `search_field`
- `load_field`
- `compare_datatype`
- `load_field_datatype`

适合联动：

- `schedule_tree_simulation`
- `schedule-architecture`

#### `t_app_proxy`

重点看：

- `app_id`
- `zone`
- `inner_ip`

适合联动：

- `t_proxy`
- `schedule_top_profiles`

#### `t_user_proxy`

重点看：

- `user_id`
- `resource_id`
- `proxy_id`

适合联动：

- `t_proxy`
- `t_schedule_history`

#### `t_user_app_cds`

重点看：

- `user_id`
- `app_id`
- `bcs_env_id`
- `cgs_id`
- `status`
- `resource_id`

适合联动：

- `t_cds_info`
- `t_cgs_server`
- `schedule_overview`

#### `t_cds_info`

重点看：

- `server_id`
- `cds_id`
- `status`
- `zone_id`
- `inner_ip`
- `version`

适合联动：

- `t_user_app_cds`
- `t_schedule_history`
- `Bk-monitor 日志查询 MCP`

#### `t_cgs_server`

重点看：

- `server_id`
- `bcs_env_id`
- `status`
- `zone_id`
- `inner_ip`
- `version`

适合联动：

- `t_cds_info`
- `schedule-architecture`

#### `t_schedule_history`

重点看：

- `status`
- `error_code`
- `error_message`
- `cost_time_ms`
- `schedule_mode`
- `is_observer`
- `proxy_endpoint`
- `cds_id`
- `old_cgs_id`
- `create_time`

适合联动：

- `Bk-monitor 日志查询 MCP`
- `t_user_app_cds`
- `t_proxy`

## 场景到表的快速映射

| 场景                                    | 优先查表                                           | 说明                                   |
| --------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| 区域 Proxy 供给不足 / 运营商分布异常    | `t_proxy`, `t_proxy_group`, `t_proxy_zone_backup`  | 先看真实资源，再看 group / backup 限制 |
| TreeFilter 或某层树维度导致候选骤减     | `t_tree_level_defines`, `t_proxy_group`, `t_proxy` | 先解释树维度，再回看资源               |
| 某 app 候选过少                         | `t_app_proxy`, `t_proxy`                           | 判断是否存在应用白名单式限制           |
| 个别用户总是命中特定 Proxy              | `t_user_proxy`, `t_proxy`, `t_schedule_history`    | 判断是否为用户级绑定                   |
| 绑定未复用 / `existing_assignment` 异常 | `t_user_app_cds`, `t_cds_info`, `t_cgs_server`     | 核实用户与实例绑定关系                 |
| 失败率 / 错误码 / 耗时异常              | `t_schedule_history`                               | 结合日志一起看更稳妥                   |

## 日志排查建议

使用 `Bk-monitor 日志查询 MCP` 时，优先围绕以下维度收敛查询：

- 时间窗口：与调度统计窗口对齐
- 服务：Scheduler / CgsAgent / 相关 Report 分析服务
- 标识：`zone_id`, `cds_id`, `oldCgsId`, `server_id`, `session_id`, `proxy_endpoint`, `error_code`
- 现象：`timeout`, `retry`, `failed`, `exception`, `notify`, `consume`, `writeAndFlush`

如果目标是解释推送链路异常，优先结合 `schedule-architecture` 中的：

- Scheduler 异步推送 `notify_schedule_info`
- Kafka 消费
- `PendingScheduleStore`
- Netty TCP 下发

## 最终输出模板

按以下结构输出：

### 1. 分析对象

- 区域
- 时间窗口
- 分析目标
- 使用的数据源

### 2. 执行路径

按顺序列出实际查询过的 MCP 工具、DB、日志与 skill。

### 3. 关键现象

只列事实，例如：

- `fresh_alloc` 偏高
- Top1 画像集中
- TreeFilter 后候选骤降
- 某运营商 Proxy 供给不足
- 调度失败集中在异常窗口

### 4. 多维度证据

- 调度统计证据
- DB 配置 / 资源证据
- 日志运行时证据
- 架构逻辑解释

### 5. 推理链路

把 `现象 -> 证据 -> 推理` 串起来，说明为什么更接近某个根因，而不是其他解释。

### 6. 最终结论

必须区分：

- `已证实`
- `高概率`
- `待验证`

### 7. 建议动作

按优先级输出：

- `P0`：需要立即确认或止损
- `P1`：配置修正 / 资源补充 / 绑定核查
- `P2`：观察项与后续优化

## 常见错误

- 把 DB 查询当成起点，而不是用来验证假设
- 看到单一错误日志就直接下结论
- 没有区分统计事实和逻辑解释
- 查到异常后没有回到“当前 proxy 调度主问题”上收敛
- 用“可能”堆砌段落，却没有明确哪些已经被证据支持
