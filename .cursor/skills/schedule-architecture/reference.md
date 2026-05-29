# 调度系统详细参考

本文档作为 SKILL.md 的补充，提供 Scheduler 和 CgsAgent 两个模块更详细的实现细节。

## Scheduler 核心类索引

### 服务层

| 类                            | 路径                                                       | 职责                                                                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SchedulerService`            | `biz-scheduler/.../service/SchedulerService.kt`            | 调度主入口：CDS 调度、AI 调度、踢实例、观察者调度；`buildAllocationRequest()` 在 `scheduleMode == WEBRTC` 时向 `DirectAllocRequest.proxyTags` 追加 `FlagOfWebRtc`（与 `singleSidedNetwork`→`FlagOfOneSidedNetwork` 对称，供代理树 `webrtc` 过滤） |
| `AllocService`                | `biz-scheduler/.../service/AllocService.kt`                | 资源分配编排：组装 PolicyManager + FilterManager + Allocator                                                                                                                                                                                      |
| `AssignmentCheckService`      | `biz-scheduler/.../service/AssignmentCheckService.kt`      | 已有实例检查、调度历史记录写入                                                                                                                                                                                                                    |
| `ApplyInstanceService`        | `biz-scheduler/.../service/ApplyInstanceService.kt`        | 实例 ID 申请、CDS Key 申请/校验                                                                                                                                                                                                                   |
| `SchedulerUserService`        | `biz-scheduler/.../service/SchedulerUserService.kt`        | 用户会话管理、实例状态查询                                                                                                                                                                                                                        |
| `SchedulerReportService`      | `biz-scheduler/.../service/SchedulerReportService.kt`      | 调度回调上报                                                                                                                                                                                                                                      |
| `ProxyCacheBroadcastConsumer` | `biz-scheduler/.../service/ProxyCacheBroadcastConsumer.kt` | Kafka 消费：代理缓存刷新                                                                                                                                                                                                                          |
| `CdsKeySignatureService`      | `biz-scheduler/.../service/CdsKeySignatureService.kt`      | CDS Key 签名校验（HMAC-SHA256 + nonce 防重放）                                                                                                                                                                                                    |
| `DirectAllocRequest`          | `biz-scheduler/.../pojo/DirectAllocRequest.kt`             | 直连分配请求（含 `proxyTags` 等调度上下文；`webrtc` 隔离由入口按模式注入标签，非本类新增字段）                                                                                                                                                    |

### 调度核心

| 类                     | 路径                                     | 模式                                                                                                                            |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PolicyManager`        | `schedule/PolicyManager.kt`              | Builder + 策略编排                                                                                                              |
| `FilterManager`        | `schedule/FilterManager.kt`              | Builder + 过滤器链                                                                                                              |
| `AllocatorManager`     | `schedule/AllocatorManager.kt`           | Builder + 分配器管理                                                                                                            |
| `ScheduleContext`      | `schedule/ScheduleContext.kt`            | 调度上下文，贯穿整个调度流程                                                                                                    |
| `ParamCheckPolicy`     | `schedule/policy/ParamCheckPolicy.kt`    | 参数校验策略                                                                                                                    |
| `NormalSearchPolicy`   | `schedule/policy/NormalSearchPolicy.kt`  | 标准搜索策略：过滤 → 分配                                                                                                       |
| `CdsAllocator`         | `schedule/alloctor/CdsAllocator.kt`      | CDS 资源分配器（GPU/CPU/Encoder ZSet 评估）                                                                                     |
| `TreeBuilder`          | `schedule/proxy/TreeBuilder.kt`          | 代理树构建与缓存管理；`buildTree()` 对 `"webrtc"` 调用 `handleWebRtc`（无 `webrtc` 标签 → `NULL` 子树，有标签 → `webrtc` 子树） |
| `MetaMgr`              | `schedule/proxy/MetaMgr.kt`              | 代理树元数据：`definesToMeta()` 硬编码层级定义，含 `webrtc` 层（defineId=14，紧接 `single_sided_network`）                      |
| `ProxyTagNames`        | `pojo/tree/ProxyTagNames.kt`             | Proxy 标签常量，含 `FlagOfWebRtc = "webrtc"`（与 `single_sided_network` 范式对称）                                              |
| `ProxyNormalAllocator` | `schedule/proxy/ProxyNormalAllocator.kt` | 代理节点分配器                                                                                                                  |

### 搜索画像与埋点

| 类                        | 路径                                                            | 职责                                                                                           |
| ------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SearchProfile`           | `biz-scheduler/.../schedule/profile/SearchProfile.kt`           | 不可变画像数据类（RequestProfile / TreeSearchProfile / FilterOutcomeProfile / DecisionSource） |
| `MutableSearchProfile`    | `biz-scheduler/.../schedule/profile/SearchProfile.kt`           | 热路径可变画像，含各阶段 `*_executed` 标记                                                     |
| `SearchProfileBuilder`    | `biz-scheduler/.../schedule/profile/SearchProfileBuilder.kt`    | 标准化逻辑 + profile signature 生成                                                            |
| `ScheduleProfileRecorder` | `biz-scheduler/.../schedule/profile/ScheduleProfileRecorder.kt` | 画像/原因码/漏斗/执行计数写入 Redis                                                            |

### CDS 维度过滤器

| 过滤器                 | 路径                                      | 职责                                              |
| ---------------------- | ----------------------------------------- | ------------------------------------------------- |
| `ProxyAllocFilter`     | `schedule/filter/ProxyAllocFilter.kt`     | 代理分配过滤（调用代理维度过滤链）                |
| `CdsWhiteListFilter`   | `schedule/filter/CdsWhiteListFilter.kt`   | CDS 白名单过滤                                    |
| `SingleInstanceFilter` | `schedule/filter/SingleInstanceFilter.kt` | 单实例限制过滤                                    |
| `RedisZsetFilter`      | `schedule/filter/RedisZsetFilter.kt`      | Redis ZSet 指标过滤（CGS 存活、编码器、GPU、CPU） |

### Proxy 维度过滤器

| 过滤器                     | 路径                                         | 职责                                                                                                                                                                           |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProxyTreeFilter`          | `schedule/proxy/ProxyTreeFilter.kt`          | 代理树匹配过滤；`makeSearchPath()` 对 `"webrtc"` 调用 `handleWebRtc(proxyTags)`，按 `req.proxyTags.contains(FlagOfWebRtc)` 决策，与 `handleSingleSidedNetwork(proxyTags)` 对称 |
| `ProxyAppPermissionFilter` | `schedule/proxy/ProxyAppPermissionFilter.kt` | 应用权限过滤                                                                                                                                                                   |
| `ProxyTelecomFilter`       | `schedule/proxy/ProxyTelecomFilter.kt`       | 运营商匹配                                                                                                                                                                     |
| `ProxyCdsDialScoreFilter`  | `schedule/proxy/ProxyCdsDialScoreFilter.kt`  | 拨测评分                                                                                                                                                                       |
| `ProxyRedisZsetFilter`     | `schedule/proxy/ProxyRedisZsetFilter.kt`     | Redis 指标（评分、带宽、测速）                                                                                                                                                 |

### 搜索画像 Redis Key

| Key 模式                                             | 类型 | 写入方                    | 说明                                                |
| ---------------------------------------------------- | ---- | ------------------------- | --------------------------------------------------- |
| `s_schedule_profile_dist_{zoneId}_{yyyyMMddHHmm}`    | Hash | `ScheduleProfileRecorder` | 画像签名 → 计数                                     |
| `s_schedule_filter_reason_{zoneId}_{yyyyMMddHHmm}`   | Hash | `ScheduleProfileRecorder` | 原因码 → 计数                                       |
| `s_schedule_trace_{zoneId}_{yyyyMMddHHmm}`           | Hash | `ScheduleProfileRecorder` | 漏斗 field（各阶段 out_sum / executed_count）→ 计数 |
| `s_schedule_decision_source_{zoneId}_{yyyyMMddHHmm}` | Hash | `ScheduleProfileRecorder` | 决策来源（fresh_alloc/existing/observer）→ 计数     |

### Redis 工具类

| 类                     | 路径                            | 职责                          |
| ---------------------- | ------------------------------- | ----------------------------- |
| `AccessRedisUtils`     | `redis/AccessRedisUtils.kt`     | UserAccessInfo / CDS 校验信息 |
| `ZSetRedisUtils`       | `redis/ZSetRedisUtils.kt`       | ZSet 操作 + pipeline 批量读取 |
| `UserRedisDaoImpl`     | `redis/UserRedisDaoImpl.kt`     | 用户会话 CRUD                 |
| `ResTokenRedisDaoImpl` | `redis/ResTokenRedisDaoImpl.kt` | 资源 Token 管理               |
| `SessionRedisUtils`    | `redis/SessionRedisUtils.kt`    | 调度 Session                  |
| `SchedulerRedisKey`    | `redis/SchedulerRedisKey.kt`    | Redis Key 前缀定义（`s_`）    |

### 配置类

| 类                          | 路径                                  | 职责                             |
| --------------------------- | ------------------------------------- | -------------------------------- |
| `ProxyCacheBroadcastConfig` | `config/ProxyCacheBroadcastConfig.kt` | Kafka 消费者工厂配置（广播模式） |

### 远程调用

| 类                    | 路径                            | 调用目标    |
| --------------------- | ------------------------------- | ----------- |
| `EngineServiceClient` | `client/EngineServiceClient.kt` | Engine 服务 |

## DAO 与数据源映射

### cloudgame 数据源

`@Qualifier("cloudgameDslContext")` 注入，使用 `impl/dbcloudgame/` 下的实现：

- `ProxyDaoImpl` → `T_PROXY`, `T_PROXY_GROUP`, `T_PROXY_ZONE_BACKUP`
- `CdsServerDaoImpl` → `T_CDS_INFO`, `T_CGS_SERVER`
- `CdsKeyDaoImpl` → `T_CDS_KEY`
- `UserProxyDaoImpl` → `T_USER_PROXY`
- `UserAppCdsDaoImpl` → `T_USER_APP_CDS`
- `AppProxyDaoImpl` → 应用代理
- `ScheduleHistoryDaoImpl` → `T_SCHEDULE_HISTORY`
- `GameDaoImpl` → `t_game`, `t_game_resource`

### scheduler 数据源

使用 `impl/dbscheduler/` 下的实现：

- `ProxyTreeDaoImpl` → `t_tree_level_defines` 等代理树配置表

## Kafka 消费者广播机制

`ProxyCacheBroadcastConfig` 中的关键设计：

```kotlin
// 每个节点独立 Consumer Group，实现广播语义
val groupId = "${PROXY_CACHE_REFRESH_TOPIC}_${hostname}"
```

- Topic: `proxy_cache_refresh`
- 手动提交 offset（`AckMode.MANUAL_IMMEDIATE`）
- 每个 Pod 使用 hostname 作为 group 后缀，确保所有节点都收到消息

## AI 调度

`SchedulerService.cdsAIScheduler()` 提供 AI 场景调度：

- 自动生成 startToken
- 通过 `envId` 获取 CDS 绑定信息
- 复用标准调度流程

## Console (Go) 集成

`src/console/backend_src/internal/schedule/` 包含 Go 实现的管理功能：

| 子模块          | 功能                                   |
| --------------- | -------------------------------------- |
| `specify-proxy` | 管理 `t_user_proxy` 表（用户指定代理） |
| `cds-key`       | CDS Key 申请/校验                      |
| `share`         | 共享类型定义                           |

通过 `notification.TableModify` 在表变更时通知相关服务。

### 监控模块

`src/console/backend_src/internal/monitoring/` 提供连接监控聚合 API：

| 文件         | 职责                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.go`   | 定义 CdsConnectionDetail、ConnectionStats、ConnectionStatsOutput、TotalStats、DiagnosticInfo、CdsIdsOutput、k8sEndpoints 结构体              |
| `handler.go` | 通过 K8s Endpoints API 发现 cgsagent 实例，并发调用各节点接口并聚合；GetConnectionStats（统计）和 GetCdsIds（按需加载 cdsId 列表）           |
| `api.go`     | HTTP 入口函数 `GetConnectionStats`（`/console/monitoring/connections`）和 `GetConnectionCdsIds`（`/console/monitoring/connections/cds_ids`） |

**数据流**：Vue 前端 → Console Go 后端 → K8s Endpoints API 发现 CgsAgent Pod IP → 并发调用各节点 REST 接口 → 聚合返回。

**连接监控服务发现**：

1. 读取 Pod 内挂载的 Service Account Token 和 Namespace
2. 调用 `GET https://kubernetes.default.svc/api/v1/namespaces/{ns}/endpoints/{svc}` 获取所有就绪 Pod IP
3. 降级：K8s API 不可用时回退到 K8s Service 域名（`domain.cgsagent`），经 kube-proxy 负载均衡命中单 Pod

### 剪切板 Kafka 配置 API（031）

| 文件                                                             | 职责                                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/console/backend_src/internal/clipboard-kafka-config/api.go` | Gin 入口：`List` / `Add` / `Modify` / `Del`                                                                                                                          |
| `handler.go` / `types.go`                                        | 业务：对接 Config / `t_config_v2`，`biz_type=ClipboardKafkaConfig`                                                                                                   |
| 路由                                                             | `/console/clipboard-kafka-config/list`、`add`、`modify`、`del`（与 `api.go` 路由聚合一致即可）                                                                       |
| Vue                                                              | `src/console/frontend_src/src/views/console/configControl/clipboardKafkaConfig/indexView.vue`，路径 `/console/config_control/clipboard_kafka_config`；权限：`config` |
| 通用 Config 写入日志                                             | `internal/console-config/config/handler.go`：对 **`password` / `secret` / `token` / `sasl_jaas_config` / `saslJaasConfig`** 等字段 **脱敏**，避免凭据落入日志        |

`src/console/frontend_src/src/views/console/monitoring/connectionDashboard.vue`：

- 汇总卡片：节点数、总活跃连接、总注册连接
- 节点详情表格：hostname、活跃连接、注册连接、未注册连接、更新时间
- cdsId 下钻弹窗：显示 CDS ID、注册时间（支持排序）、查看详情跳转
- 支持手动刷新和 10s 自动轮询

## CgsAgent 核心类索引

所有路径前缀：`src/backend/cds/ext/tencent/cgsagent/`

### API 层

| 类                        | 路径                                                       | 职责                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `CdsAgentResource`        | `api-cgsagent-tencent/.../api/CdsAgentResource.kt`         | REST 接口定义（notify_schedule_info, kick_instance, fetch_thumbnail, connection_stats）                                                 |
| `NotifyScheduleInfoReq`   | `api-cgsagent-tencent/.../pojo/NotifyScheduleInfoReq.kt`   | 调度通知请求 DTO（含 userId, sessionId, cgsId, cdsId, 资源信息等；其中 `proxyEndpoint` 在 `WEBRTC` 模式下由 Proxy `cds_endpoint` 提供） |
| `CgsKickInstanceReq`      | `api-cgsagent-tencent/.../pojo/CgsKickInstanceReq.kt`      | 踢出实例请求 DTO                                                                                                                        |
| `ConnectionStatsResponse` | `api-cgsagent-tencent/.../pojo/ConnectionStatsResponse.kt` | 连接统计响应 DTO（hostname, activeConnections, registeredConnections, registeredCdsIds:`List<CdsConnectionDetail>?` 可选, timestamp）   |
| `CdsConnectionDetail`     | `api-cgsagent-tencent/.../pojo/ConnectionStatsResponse.kt` | 连接详情 DTO（cdsId + registeredAt 注册时间戳）                                                                                         |

### 服务层

| 类                              | 路径                                                                        | 职责                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CdsAgentResourceImpl`          | `biz-cgsagent-tencent/.../resource/CdsAgentResourceImpl.kt`                 | API 实现：HTTP 请求转发到 Kafka                                                                                                                                                                                 |
| `CdsMessageProducer`            | `biz-cgsagent-tencent/.../service/CdsMessageProducer.kt`                    | Kafka 生产者：发送调度/踢出/缩略图消息                                                                                                                                                                          |
| `CdsMessageConsumer`            | `biz-cgsagent-tencent/.../service/CdsMessageConsumer.kt`                    | Kafka 消费者：@KafkaListener 监听三个 Topic                                                                                                                                                                     |
| `CdsMessageProcessor`           | `biz-cgsagent-tencent/.../service/CdsMessageProcessor.kt`                   | 消息处理器：查找 TCP 连接并通过 ProtocolHandler 发送                                                                                                                                                            |
| `CdsConnectionManager`          | `biz-cgsagent-tencent/.../service/CdsConnectionManager.kt`                  | TCP 连接管理：cdsFdMap(cdsId→RegisteredChannel)、getCdsConnection、register/unregister；内部类 RegisteredChannel(channelId, registeredAt) 记录注册时间                                                          |
| `CdsConsumerCacheService`       | `biz-cgsagent-tencent/.../service/CdsConsumerCacheService.kt`               | Redis 幂等校验：消费标志管理（TTL=60s）                                                                                                                                                                         |
| `PendingScheduleStore`          | `biz-cgsagent-tencent/.../service/PendingScheduleStore.kt`                  | 调度延迟连接优化：Redis 暂存待发送消息，连接就绪后投递                                                                                                                                                          |
| `SocketHandlerService`          | `biz-cgsagent-tencent/.../service/SocketHandlerService.kt`                  | TCP 消息处理入口：接收上行消息，转发到 ProtocolHandler                                                                                                                                                          |
| `ClipboardDataReportParser`     | `biz-cgsagent-tencent/.../service/clipboard/ClipboardDataReportParser.kt`   | `reserved` 4×uint32（LE）+ `ui32Size`（LE）+ UTF-8 JSON；**`ui32Size` 必须等于其后剩余字节数**；**七 JSON 字段必填**；`text` UTF-8 **>** 1MB 丢弃                                                               |
| `ClipboardDataReportService`    | `biz-cgsagent-tencent/.../service/clipboard/ClipboardDataReportService.kt`  | `parse → getConfig(appId) → publish`；无效或无配置 WARN 丢弃                                                                                                                                                    |
| `ClipboardKafkaConfigService`   | `biz-cgsagent-tencent/.../service/clipboard/ClipboardKafkaConfigService.kt` | `RedisOperation.get`，Key `configV2:cacheByGameId:{appId}:ClipboardKafkaConfig`；`BIZ_TYPE=ClipboardKafkaConfig`                                                                                                |
| `ClipboardKafkaPublisher`       | `biz-cgsagent-tencent/.../service/clipboard/ClipboardKafkaPublisher.kt`     | `kafkaTemplate.send(topic, rawJson)`，不指定 record key；**按 `appId` 缓存 Producer**；配置 **SHA-256 指纹**（**不把 `sasl_jaas_config` 等当 key**）；同 `appId` 指纹变化时关闭旧 Producer；发送失败 ERROR 日志 |
| `ClipboardKafkaTemplateFactory` | 同上文件                                                                    | `create(config)` 供 Publisher 构建/复用 `KafkaTemplate<String, String>`；配合按 `appId` 关闭语义                                                                                                                |

### 协议处理层

| 类                      | 路径                                                             | 职责                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProtocolHandler`       | `biz-cgsagent-tencent/.../service/protocol/ProtocolHandler.kt`   | 协议门面：上行消息分发 + 下行消息发送（sendNotifyMessage 等）                                                                                                                                                                                                     |
| `MessageBuilder`        | `biz-cgsagent-tencent/.../service/protocol/MessageBuilder.kt`    | 消息构建：JSON→InnerMessage→OuterMessage→AES加密→协议帧                                                                                                                                                                                                           |
| `HandshakeHandler`      | `biz-cgsagent-tencent/.../service/protocol/MessageHandlers.kt`   | 握手处理：验证 magic flags，设置 authSuccess                                                                                                                                                                                                                      |
| `CryptoMessageHandler`  | `biz-cgsagent-tencent/.../service/protocol/MessageHandlers.kt`   | 加密协商：算法请求 + 密钥协商（AES-256-CFB）                                                                                                                                                                                                                      |
| `ControlMessageHandler` | `biz-cgsagent-tencent/.../service/protocol/MessageHandlers.kt`   | 控制消息：**subType=11**：将 **`InnerMessage` 控制头之后的整段剩余 body** 交给 Parser（**不按 2 字节 `DataLen` 截断**），`copyOfRange` 后 **`nettyBizExecutor.execute { clipboardDataReportService.handle(...) }`**；其余心跳/用户信息/游戏状态等仍在调用线程处理 |
| `ClientDataHandler`     | `biz-cgsagent-tencent/.../service/protocol/MessageHandlers.kt`   | 客户端数据处理                                                                                                                                                                                                                                                    |
| `KeyVerifyHandler`      | `biz-cgsagent-tencent/.../service/protocol/KeyVerifyHandler.kt`  | 密钥校验：验证 oldCgsId+cdsKey，通过 MySQL 解析 cdsId，注册连接映射                                                                                                                                                                                               |
| `MessageValidator`      | `biz-cgsagent-tencent/.../service/protocol/MessageValidator.kt`  | 消息校验：长度、认证状态等                                                                                                                                                                                                                                        |
| `ProtocolConstants`     | `biz-cgsagent-tencent/.../service/protocol/ProtocolConstants.kt` | 含 `HOST_TO_TIMING_SERVICE_CONTROL_MESSAGE_TYPE_CLIPBOARD_DATA_REPORT = 11u` 等控制消息子类型                                                                                                                                                                     |

### TCP 网络层

| 类                   | 路径                                                 | 职责                                                                                          |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `SocketServer`       | `biz-cgsagent-tencent/.../tcp/SocketServer.kt`       | Netty TCP 服务端（端口/线程/backlog 均可配置）                                                |
| `SocketInitializer`  | `biz-cgsagent-tencent/.../tcp/SocketInitializer.kt`  | Channel Pipeline：Decoder → ByteArrayDecoder → SocketHandler                                  |
| `SocketHandler`      | `biz-cgsagent-tencent/.../tcp/SocketHandler.kt`      | KEY_VERIFY（msgType=5）异步 offload；**剪切板 subType=11 在 `ControlMessageHandler` offload** |
| `NettyStartListener` | `biz-cgsagent-tencent/.../tcp/NettyStartListener.kt` | ApplicationRunner：应用启动时拉起 TCP 服务                                                    |

### 加密与工具

| 类              | 路径                                                       | 职责                                   |
| --------------- | ---------------------------------------------------------- | -------------------------------------- |
| `CryptoService` | `biz-cgsagent-tencent/.../service/crypto/CryptoService.kt` | AES/RSA 加解密、加密算法协商、密钥协商 |
| `CodeCUtil`     | `biz-cgsagent-tencent/.../util/CodeCUtil.kt`               | 帧编解码、字节序处理、Hex 转换         |
| `AesUtil`       | `biz-cgsagent-tencent/.../util/AesUtil.kt`                 | AES-256-CFB 加解密                     |
| `RSAUtil`       | `biz-cgsagent-tencent/.../util/RSAUtil.kt`                 | RSA 加解密（密钥传输）                 |

### 远程调用

| 类                       | 路径                                                        | 调用目标                            |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------- |
| `SchedulerServiceClient` | `biz-cgsagent-tencent/.../client/SchedulerServiceClient.kt` | Scheduler 服务（获取 CDS 校验信息） |

### 配置类

| 类                     | 路径                                                      | 职责                                                |
| ---------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| `StartKafkaConfig`     | `biz-cgsagent-tencent/.../config/StartKafkaConfig.kt`     | Kafka 消费者/生产者工厂配置                         |
| `KafkaRetryConfig`     | `biz-cgsagent-tencent/.../config/KafkaRetryConfig.kt`     | Kafka 重试策略配置                                  |
| `CloudgameRedisConfig` | `biz-cgsagent-tencent/.../config/CloudgameRedisConfig.kt` | cloudgame Redis 数据源配置                          |
| `NettyConfig`          | `biz-cgsagent-tencent/.../config/NettyConfig.kt`          | Netty 业务线程池 Bean（nettyBizExecutor），优雅关停 |

### 监控指标

| 类                       | 路径                                                         | 职责                                                    |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------- |
| `NettyConnectionMetrics` | `biz-cgsagent-tencent/.../metrics/NettyConnectionMetrics.kt` | MeterBinder：注册 TCP 连接数 Gauge（active/registered） |

### 数据模型

| 类                  | 路径                                                   | 说明                                         |
| ------------------- | ------------------------------------------------------ | -------------------------------------------- |
| `ConnectToCds`      | `biz-cgsagent-tencent/.../pojo/ConnectToCds.kt`        | TCP 连接元数据（authSuccess, cdsId, aesKey） |
| `CdsConnectionInfo` | `biz-cgsagent-tencent/.../service/CdsServiceModels.kt` | 查找连接结果（Channel + ConnectToCds）       |

## CgsAgent Kafka Topics

| Topic                     | 用途                            | Key  | 消费者 containerFactory |
| ------------------------- | ------------------------------- | ---- | ----------------------- |
| `notify_schedule_info`    | 调度结果通知 → TCP 下发到 CDS   | UUID | `netConsumerFactory`    |
| `kick_instance`           | 踢出实例 → TCP 下发到 CDS       | UUID | `netConsumerFactory`    |
| `fetch_desktop_thumbnail` | 桌面缩略图请求 → TCP 下发到 CDS | UUID | `netConsumerFactory`    |

消费确认模式：手动 ACK（`acknowledgment.acknowledge()`），消费失败也 ACK 避免无限重试。

## 剪切板出站 Kafka（031）

与上表 **三套平台 Topic 独立**：按 `ClipboardKafkaConfig` 连接业务方集群；**按 `appId` 缓存** `KafkaTemplate`/Producer；调用 `send(topic, rawJson)`，**不指定 record key**，由 Kafka Producer 默认分区策略处理以降低单 app 热点风险；**value = 客户端上报的原始 JSON 字符串（UTF-8）**；配置指纹 **SHA-256**，**不把敏感 JAAS 串放入 map key**；同 `appId` 配置变更关闭旧生产者。无配置 / `enabled=false` / 解析失败：`ClipboardDataReportService` **WARN** 并丢弃，不向 CDS 回写错误详情。

## CgsAgent 异常处理机制

| 异常类                   | 用途                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `ConsumerException`      | 不可恢复异常（如 CDS 校验信息不存在），直接 ACK                                                      |
| `ConsumerRetryException` | 可恢复异常（如连接暂时不可用）；调度通知场景下由 `PendingScheduleStore` 暂存到 Redis，连接就绪后投递 |

## 跨服务数据流关键路径

### 调度推送路径

```
Scheduler                              CgsAgent
─────────────────────────────────      ──────────────────────────────────
SchedulerService.processScheduler()
  → AssignmentCheckService
    .packScheduleAndReturn()
    → SchedulerUserService
      .pushScheduleInfo()              CdsAgentResourceImpl
      （WEBRTC: 使用 `scheduleResult.cdsEndpoint`；
       其他模式: 使用 `scheduleResult.proxyEndpoint`）
      → Feign: notifyScheduleInfo() ──→  .notifyScheduleInfo()
                                         → CdsMessageProducer
                                           .sendScheduleNotification()
                                           → Kafka(notify_schedule_info)
                                           → CdsMessageConsumer
                                             .consumeScheduleNotification()
                                           → CdsMessageProcessor
                                             .processScheduleNotification()
                                           ┌─ 连接就绪:
                                           │  → ProtocolHandler.sendNotifyMessage()
                                           │  → channel.writeAndFlush() → [CDS]
                                           │  → clearPending(cdsId)
                                           └─ 连接未就绪:
                                              → PendingScheduleStore.storePending()
                                              → Redis SET(等待连接)
                                              → registerConnection() 触发 drainAndSend()
                                              → channel.writeAndFlush() → [CDS]
```

### 踢出实例路径

```
Scheduler                              CgsAgent
─────────────────────────────────      ──────────────────────────────────
SchedulerService.kickInstance()
  → Feign: kickInstance() ────────────→ CdsAgentResourceImpl
                                         → CdsMessageProducer
                                           .sendKickInstanceMessage()
                                           → Kafka(kick_instance)
                                           → CdsMessageConsumer
                                             .consumeKickInstance()
                                           → CdsMessageProcessor
                                             .processKickInstance()
                                           → ProtocolHandler
                                             .sendKickInstanceMessage()
                                           → channel.writeAndFlush()
                                           → [CDS 实例 TCP 连接]
```
