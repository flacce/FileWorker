# FileWorker

高性能、现代化 **文件云 + 在线剪贴板 + 统一工作台 (Edge Studio)**，基于 **Cloudflare Pages + R2 Binding + Hono v4**。

---

## 核心特性与架构升级

- **Cloudflare Edge 原生极速后端**：
  - **Hono v4** 驱动的 Pages Functions，极致精简的高性能路由。
  - **HTTP 206 Partial Content (Range)**：音视频毫秒级切片随意拖拽起播，大文件按需传输无需消耗额外内存。
  - **智能 ETag / 304 条件缓存**：秒级验证，0 额外带宽消耗。
  - **Web Crypto 原生鉴权**：支持常数时间密码哈希比对、Session Cookie、`Authorization: Bearer <password>` 及 HMAC-SHA256 临时签名直链生成。
- **现代化 Edge Studio 统一工作台**：
  - **全套最新现代化技术栈**：Vite 8 (Rolldown) + Vue 3.5 + Vue Router 5 + Pinia 4 + UnoCSS。
  - **全局智能 Paste Anywhere**：在任意界面按 `Ctrl + V` 即可将截图或文件直接推送到 R2 并自动复制直链。
  - **Master-Detail 实时 Inspector**：点击代码直接在右侧内联 CodeMirror 6 编辑保存并一键渲染 Markdown；点击图片/音视频直接播放/缩放查看。
  - **去模板化极简美学**：中性钛黑哑光质感 + 清新明亮 Sun Amber 琥珀暖黄。
  - **分享与集成中心**：一键生成 Raw 直链、Markdown、HTML、BBCode 以及指定有效期的临时 HMAC 签名分享直链。

---

## 路径与 API 契约（100% 保持稳定）

| 用途 | 路径 | 鉴权方式 | 说明 |
|------|------|------|------|
| 直链读取 / 写入 | `/{key}` | 公开或 Cookie / Token | GET/PUT/PATCH/DELETE，支持 Range 206 秒开、ETag 304 缓存 |
| 工作台首页 | `/#/` | 页面路由 | 统一资产管理工作台 (Edge Studio) |
| 文件中心 | `/#/file` | 页面路由 | Hash 路由，自动映射至文件过滤视图 |
| 在线剪贴板 | `/#/clip` | 页面路由 | Hash 路由，自动映射至代码/剪贴板视图 |
| 安全登录 | `/#/login` | 页面路由 | 极简安全登录页 |
| 列表查询 | `/api/list` | Cookie / Bearer | 支持游标分页与前缀过滤 |
| 鉴权与登录 | `/api/auth` | Cookie / Bearer | GET / POST 登录态维护 |
| 对象重命名 | `/api/rename` | Cookie / Bearer | POST 重命名对象 |
| 临时签名直链 | `/api/sign` | Cookie / Bearer | POST 生成指定有效期的 HMAC 签名分享直链 |
| 批量删除 | `/api/batch-delete` | Cookie / Bearer | POST 批量删除文件 |
| 存储统计概览 | `/api/stats` | Cookie / Bearer | GET 存储用量与类型统计 |

> **公开文件访问示例**：`https://your-domain.com/<filename>`

---

## 快速部署

### 1. 创建 Cloudflare R2 存储桶
在 Cloudflare 控制台创建 R2 Bucket（例如 `my-fileworker-bucket`）。

### 2. 配置 `wrangler.toml`
将 `wrangler.toml` 中的 `bucket_name` 更改为你的 R2 Bucket 名称：

```toml
name = "fileworker"
compatibility_date = "2025-12-18"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-fileworker-bucket"
preview_bucket_name = "my-fileworker-bucket"
```

### 3. 配置环境变量
在 Cloudflare Pages 设置中的 **Environment variables** 添加：
- `PASSWORD`：访问密码（例如 `your-secret-password`）
- 或 `PASSWORD_HASH`：密码的 SHA-256 哈希值（可通过 `echo -n "your-password" | sha256sum` 生成）

### 4. 构建与部署

```bash
# 安装依赖
pnpm install

# 部署到 Cloudflare Pages
pnpm run deploy
```

---

## 本地开发与调试

```bash
# 复制开发环境变量示例
cp .dev.vars.example .dev.vars

# 启动前端热重载
pnpm dev

# 在本地完整模拟 Cloudflare R2 与 Functions 边缘运行环境
pnpm preview
```

---

## License

MIT License
