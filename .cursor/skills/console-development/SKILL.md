---
name: console-development
description: Console 模块（Go 后端 + Vue 前端）开发参考。当需要新增或修改 Console 的监控页面、API 路由、Go 转发逻辑、Vue 页面时使用。涵盖 HTTP 工具用法、响应解析约定、Go handler/types/api 三文件模式、路由注册、权限配置、Vue 组件风格等核心约定。
---

# Console 模块开发参考

Console 由 Go 后端（Gin）和 Vue 3 前端组成。Go 后端负责鉴权和 HTTP 转发（调 Report/Scheduler 等后端服务），Vue 前端负责展示。

## 目录结构

```
src/console/
├── backend_src/                    # Go 后端
│   ├── internal/
│   │   ├── api/api.go              # 路由注册（唯一入口）
│   │   ├── config/config.go        # 配置读取
│   │   ├── db/permission.go        # 路径常量 + 权限定义
│   │   ├── monitoring/             # 监控类功能
│   │   │   ├── *_api.go            # Gin handler（入口）
│   │   │   ├── *_handler.go        # 业务逻辑（调下游服务）
│   │   │   └── *_types.go          # DTO 定义
│   │   └── ...
│   └── go.mod                      # module: git.woa.com/start/backend/tob/console
└── frontend_src/                   # Vue 前端
    └── src/
        ├── utils/
        │   ├── http.js             # axios 封装
        │   └── index.js            # facade 导出
        ├── router/boards/console.js # 路由定义
        ├── views/
        │   ├── layout/layoutView.vue # 侧栏导航
        │   └── console/monitoring/   # 监控页面
        └── ...
```

---

## Vue 前端约定

### HTTP 请求（最易出错，必须严格遵守）

```javascript
// 正确
import { http } from "@/utils";

// 错误 — 不存在
import ajax from "@/utils/ajax";
import axios from "axios";
```

**响应解析**：`http.js` 的响应拦截器在 `code === 0` 时直接返回 `res.data`（即 `{code, msg, data}`），非 0 时 reject。因此调用方：

```javascript
// 正确
const res = await http.get('/monitoring/proxy', { params })
const data = res.data  // data 就是业务载荷

// 错误 — 不需要再判断 code
if (res.data?.code === 0) { ... }  // 多余，拦截器已处理
res.data.data  // 多嵌套了一层
```

**API 路径**：baseURL 已包含 `/console`，前端调用**不带** `/console` 前缀：

```javascript
// 正确
http.get('/monitoring/proxy', { params: { zone_id: 'zone1' } })

// 错误
http.get('/console/monitoring/proxy', ...)
```

### 组件风格

现有监控页面均使用 **Options API**：

```javascript
import { http } from "@/utils";
import { Refresh } from "@element-plus/icons-vue";

export default {
  name: "XxxDashboard",
  data() {
    return {
      loading: false,
      Refresh, // 图标需放入 data 供模板使用
      // ...
    };
  },
  mounted() {
    this.fetchData();
  },
  methods: {
    async fetchData() {
      const res = await http.get("/monitoring/xxx");
      this.list = res.data || [];
    },
  },
};
```

> Composition API (`<script setup>`) 也能正常运行，但与现有页面风格不一致。新页面优先保持一致，使用 Options API。

### UI 库

- **Element Plus** (`el-*`) + `@element-plus/icons-vue`
- **无图表库**（ECharts/Chart.js 均未安装），可视化用 CSS 柱状图或 `el-table`
- 样式用 `<style scoped>` + SCSS

### 路由注册

文件：`src/console/frontend_src/src/router/boards/console.js`

```javascript
{
  path: 'monitoring_xxx',                                    // 下划线分隔
  name: `${board}_monitoring_xxx`,                           // board = 'console'
  component: () => import('@/views/console/monitoring/xxxDashboard'),
  meta: {
    matchRoute: `/${board}/monitoring_xxx`,
    board: board
  }
}
```

### 侧栏导航

文件：`src/console/frontend_src/src/views/layout/layoutView.vue`

在 `监控大盘` 的 `children` 数组中添加：

```javascript
{
  name: '显示名称',
  url: '/console/monitoring_xxx',  // 完整路径，与路由的 matchRoute 一致
}
```

---

## Go 后端约定

### 三文件模式

每个功能域拆为三个文件：

| 文件             | 职责                 | 命名                                       |
| ---------------- | -------------------- | ------------------------------------------ |
| `xxx_types.go`   | DTO 结构体定义       | PascalCase 类型名，`json:"snake_case"` tag |
| `xxx_handler.go` | 调下游服务的业务逻辑 | 空 struct + 方法，返回 `(*Output, error)`  |
| `xxx_api.go`     | Gin 路由入口         | 包级函数 `func Xxx(c *gin.Context)`        |

### Types 模式

```go
// 对外 DTO — 大写开头
type XxxOutput struct {
    Field string `json:"field"`
}

// 对接 Report 的反序列化类型 — 小写开头（包内可见）
type reportXxxResponse struct {
    reportAPIResponse                    // 嵌入 Code + Message
    Data *XxxOutput `json:"data"`
}
```

`reportAPIResponse` 已在 `proxy_types.go` 中定义，其他 types 文件直接复用。

### Handler 模式

```go
type XxxHandler struct{}

func (h *XxxHandler) GetXxx(xlog *xlogging.Entry, param string) (*XxxOutput, error) {
    url := fmt.Sprintf("%s/api/v1/report/xxx?param=%s", config.GetReportServerDomain(), param)
    resp, err := h.doGet(url)
    // ...
    var result reportXxxResponse
    json.Unmarshal(resp, &result)
    if result.Code != 0 { return nil, fmt.Errorf(...) }
    return result.Data, nil
}

func (h *XxxHandler) doGet(url string) ([]byte, error) {
    client := &http.Client{Timeout: 10 * time.Second}
    // GET → read body → check status
}
```

### API 入口模式

```go
func GetXxx(c *gin.Context) {
    xlog := ginhelper.Log(c)
    param := c.Query("param")

    handler := XxxHandler{}
    output, err := handler.GetXxx(xlog, param)
    if err != nil {
        xlog.Errorf("GetXxx fail. %s", err.Error())
        c.JSON(http.StatusOK, errcode.ErrorSystem)
        return
    }

    c.JSON(http.StatusOK, xrender.CommonResponseType{
        Code: errcode.CodeSuccess,
        Msg:  "",
        Data: output,
    })
}
```

### 路由注册

1. **`internal/db/permission.go`** — 添加路径常量 + 加入对应角色的 `UrlList`：

```go
const (
    PathMonitoringXxx = "/console/monitoring/xxx"  // 注意：路径有 /console 前缀
)

// 在 monitoring 类型的 Permission 中添加
UrlList: []string{..., PathMonitoringXxx},
```

2. **`internal/api/api.go`** — 注册路由：

```go
r.Any(db.PathMonitoringXxx, monitoring.GetXxx)
```

### 配置

- `config.GetReportServerDomain()` — Report 服务域名（默认 `http://report-bk-cds-report`）

---

## 新增监控页面 Checklist

按此顺序操作，避免遗漏：

1. **Go types** — `internal/monitoring/xxx_types.go`：DTO + report response 类型
2. **Go handler** — `internal/monitoring/xxx_handler.go`：调 Report API
3. **Go api** — `internal/monitoring/xxx_api.go`：Gin 入口
4. **Go permission** — `internal/db/permission.go`：路径常量 + UrlList
5. **Go route** — `internal/api/api.go`：`r.Any` 注册
6. **Vue page** — `views/console/monitoring/xxxDashboard.vue`：`import { http } from '@/utils'`
7. **Vue route** — `router/boards/console.js`：懒加载路由
8. **Vue nav** — `views/layout/layoutView.vue`：侧栏导航

---

## 部署注意事项

Console 有 **三个独立部署单元**，修改后需分别构建和部署：

| 部署单元                        | 构建方式        | 影响范围             |
| ------------------------------- | --------------- | -------------------- |
| Go 后端                         | `go build`      | 路由、权限、API 转发 |
| Vue 前端                        | `npm run build` | 页面、路由、导航     |
| Kotlin 后端（Report/Scheduler） | Gradle/Maven    | REST API、业务逻辑   |

**常见陷阱**：新增 API 路径后只部署了前端，忘记部署 Go 后端。此时前端能访问页面但 API 请求会被 `CheckPermission` 中间件拒绝（code 29003, "access deny"），因为运行中的旧 Go 二进制的 `UrlList` 不包含新路径。

**排查 access deny**：如果新增的 API 返回 access deny 而已有 API 正常，首先检查 Go 服务是否用最新代码重新构建并部署。

---

## Redis 序列化陷阱（Kotlin 后端）

项目中有**两个** `RedisOperation` bean，Hash 操作必须用正确的 bean：

| Bean            | Qualifier                                | Hash Key 序列化器                 | 适用场景                                                 |
| --------------- | ---------------------------------------- | --------------------------------- | -------------------------------------------------------- |
| 默认            | 无                                       | `JdkSerializationRedisSerializer` | `get`/`set`/`zadd` 等非 Hash 操作                        |
| **String Hash** | `@Qualifier("redisStringHashOperation")` | `StringRedisSerializer`           | **所有 Hash 操作**（`hset`/`hget`/`hIncrBy`/`hentries`） |

**必须遵守**：凡是使用 `hset`、`hget`、`hIncrBy`、`hentries` 等 Hash 操作，**必须**注入 `redisStringHashOperation`：

```kotlin
@Qualifier("redisStringHashOperation")
private val redisOperation: RedisOperation
```

**原因**：默认 bean 的 `RedisTemplate` 创建时 `setHashSerializer=false`，hash key/value 使用 JDK 序列化器，会在 field 前面追加 `\xac\xed\x00\x05t\x00\x13` 等二进制头，导致存储和读取时 key 不匹配或显示乱码。

**源码位置**：`common-redis/.../RedisAutoConfiguration.kt` 中 `getRedisTemplate(factory, setHashSerializer)` 方法。
