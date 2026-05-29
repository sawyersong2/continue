---
name: proxy-schedule-analysis
description: Use when analyzing cloud desktop proxy scheduling, schedule imbalance, candidate shrinkage, filter bottlenecks, or when the user asks for a fact-based multi-source diagnosis of proxy dispatch in bk-cds.
---

# Proxy Schedule Analysis

## Overview

使用这个 skill 分析云桌面 proxy 调度问题。目标不是堆砌数据，而是基于有效事实完成多维度诊断，并输出可复查的最终分析结果。

默认先用调度分析 MCP 建立事实基线，只有在证据不足或发现异常信号时，才补查 DB / 日志。

## When to Use

- 用户提到 `proxy 调度`、`调度详情`、`调度异常`、`调度不均衡`、`候选收缩`、`过滤器瓶颈`
- 需要基于有效数据做多维度分析，而不是只看单一接口结果
- 需要把调度统计、DB 状态、日志运行时现象收敛成一个最终结论
- 需要解释为什么某个调度阶段、过滤器或推送链路会这样工作

不要用于：

- 纯代码实现任务
- 纯页面展示或前端交互调整
- 与 proxy 调度无关的通用日志检索

## Data Source Roles

- `调度分析 MCP`：主事实源。优先使用，负责建立基线和定位异常方向。
- `cds 数据查询 MCP`：配置 / 资源状态验证。只在怀疑 DB 状态、绑定关系、资源供给或表配置问题时使用。
- `Bk-monitor 日志查询 MCP`：运行时行为验证。只在怀疑错误、超时、重试、链路断点时使用。
- `schedule-architecture`：逻辑解释源。涉及 Scheduler / CgsAgent / Filter / Allocator / ProxyTree 机制说明时必须使用。

## Core Workflow

1. 先明确分析范围：`zone_id`、时间窗口、异常现象。
2. 先调用调度分析 MCP 建立基线，推荐顺序：
   - `schedule_overview`
   - `schedule_top_profiles`
   - `schedule_filter_funnel`
   - `schedule_rule_findings`
   - 按需补 `schedule_tree_simulation`
   - 按需补 `schedule_proxy_distribution`
3. 判断是否已形成证据闭环：
   - 如果调度统计已能解释问题，直接整理结论
   - 如果怀疑资源、配置、绑定关系异常，再查 `cds 数据查询 MCP`
   - 如果怀疑运行时错误、超时、重试、推送失败，再查 `Bk-monitor 日志查询 MCP`
4. 如果需要解释调度逻辑或链路机制，**REQUIRED SUB-SKILL:** 使用 `schedule-architecture`
5. 将证据整理为统一输出：现象、证据、推理、结论、建议

## Decision Rules

### 什么时候只用调度分析 MCP

- 已能明确看出画像集中、TreeFilter 瓶颈、候选集过小、区域不均衡
- `schedule_rule_findings` 已给出确定性发现，且其他统计数据能支撑该发现

### 什么时候补查 DB

- 怀疑区域 Proxy 供给、状态或运营商链路配置异常
- 怀疑应用级或用户级绑定导致候选变少
- 怀疑已有实例绑定却没有复用
- 需要确认历史统计结论与当前资源状态是否一致

### 什么时候补查日志

- 怀疑 Scheduler / CgsAgent 链路存在错误、超时、重试、投递失败
- 需要验证某个时间窗口内是否发生异常峰值或运行时告警
- DB 看起来正常，但运行时行为与统计结论不一致

### 什么时候必须用 `schedule-architecture`

- 需要解释 `Policy + Filter + Allocator` 的执行顺序
- 需要解释 `ProxyTreeFilter`、`RedisZsetFilter`、`DialScoreFilter`、`TelecomFilter` 的意义
- 需要解释 Scheduler 到 CgsAgent 的推送链路、PendingScheduleStore、TCP 下发过程

## MCP Usage Notes

- 使用 DB / 日志 MCP 前，先确认当前环境里可用的 server 名称、tool 名称和参数 schema
- 不要默认扫全库或全量日志；每次查询都必须服务于一个明确假设
- 如果查询结果与调度统计不一致，优先考虑时间窗口、缓存、统计口径差异

## Output Contract

最终输出必须是全链路型，至少包含：

1. `分析对象`：区域、时间窗口、分析目标、使用的数据源
2. `执行路径`：按顺序说明查了哪些工具 / 数据源
3. `关键现象`：只写事实，不写猜测
4. `多维度证据`：区分调度统计、DB、日志、架构逻辑
5. `推理链路`：说明证据如何收敛成结论
6. `最终结论`：区分 `已证实` / `高概率` / `待验证`
7. `建议动作`：按优先级给出可操作建议

## Common Mistakes

- 还没建立调度事实基线，就直接查 DB / 日志
- 把规则诊断结果当作唯一根因，不做交叉验证
- 证据不足时给确定性结论
- 解释调度逻辑时没有使用 `schedule-architecture`
- 查到 DB / 日志异常后，没有回到调度主问题上收敛最终结论

## Additional Resources

- 详细分析框架、DB 表地图、输出模板见 [reference.md](reference.md)
