# PROJECT AUDIT — daily-speech-practice

> 审计范围：完整仓库（Next.js 16 App Router + PostgreSQL/Drizzle + R2 + Upstash + DeepSeek/STT）。
> 本文件记录架构地图、功能真实性分级、审计发现与已完成的修复。文档不替代代码。

## 1. Architecture Map

```
Browser (React 19 client components: app/page.tsx, records, settings, auth-form, exercise-card…)
   │  fetch /api/*
   ▼
Next.js Route Handlers (src/app/api/**)     ← getCurrentUser() 会话校验 → Zod 校验 → 限流
   │
   ├─ src/lib/assessment-runner.ts  评分流水线（转写 → 基线评分 → LLM 精修 → 落库，永不抛错）
   ├─ src/lib/exercise-queries.ts   当日题库 + 用户进度查询（生成/恢复共用）
   ├─ src/lib/audio-store.ts        录音读写（R2 或本地磁盘）
   ├─ src/lib/rate-limit.ts         限流（Upstash / 进程内）
   ├─ src/lib/user-settings.ts      时区等偏好读取
   └─ src/lib/{speech-score,speech-diff,streak,trend,achievements,date}.ts  纯函数
   │
   ▼
Drizzle ORM (src/db/schema.ts) → PostgreSQL
   │
   └─ 外部：DeepSeek(生成/评分) · OpenAI 兼容 STT(转写) · Cloudflare R2 · Upstash Redis

守卫：src/proxy.ts（Next.js 16 的 proxy 约定，即 middleware）
定时：Vercel Cron → /api/cron/assessments（每 5 分钟清扫超时评分任务）
```

## 2. Feature Inventory（含真实性等级 0–5）

| Feature | UI | API | DB | 审计前 | 审计后 |
| --- | --- | --- | --- | --- | --- |
| 注册 / 登录（邮箱密码 + OAuth） | ✅ | ✅ | ✅ | LEVEL 4 | LEVEL 4 |
| 生成每日练习（DeepSeek） | ✅ | ✅ | ✅ | LEVEL 4 | **LEVEL 5**（+重试、错误分层、时区口径） |
| 恢复今日练习（刷新不丢） | ✅ | ✅ | ✅ | LEVEL 3（时区口径不一致） | **LEVEL 4** |
| 录音上传（R2 / 本地） | ✅ | ✅ | ✅ | **LEVEL 2（占位 R2 判真 → 上传必失败）** | **LEVEL 4** |
| 语音评分流水线（STT+LLM+基线） | ✅ | ✅ | ✅ | LEVEL 4 | **LEVEL 5**（+重试退避） |
| 评分状态轮询 / 重试 | ✅ | ✅ | ✅ | LEVEL 4 | LEVEL 4 |
| Cron 超时任务回收 | — | ✅ | ✅ | LEVEL 4 | LEVEL 4 |
| 打卡记录（回听 / 删除） | ✅ | ✅ | ✅ | LEVEL 4 | LEVEL 4 |
| 打卡日历 | ✅ | ✅ | ✅ | LEVEL 3（全表扫描） | LEVEL 4（按月有界查询） |
| 连续天数 / 成就 / 趋势 | ✅ | ✅ | ✅ | LEVEL 4（纯派生，无假数据） | LEVEL 4 |
| 个人设置（语言/篇数/时区） | ✅ | ✅ | ✅ | LEVEL 3（时区未校验，非法值致 500） | **LEVEL 4** |
| 账号管理（改名/改密/注销） | ✅ | ✅ | ✅ | LEVEL 4 | LEVEL 4 |
| 限流 | — | ✅ | — | LEVEL 3（生产无 Upstash 即 503，无自托管出路） | LEVEL 4（+自托管开关） |
| 路由保护 | ✅ | ✅ | — | LEVEL 2（仅前端跳转） | **LEVEL 4**（边缘 proxy + 服务端 API 鉴权） |
| 错误 / 404 边界 | ❌ | — | — | LEVEL 0 | **LEVEL 3**（error.tsx / not-found.tsx） |

## 3. Mock / Fake Data Audit

- 生产路径 **无** mock/fake/dummy/sample/hardcoded 业务数据。
- 无 `Math.random()` 伪造统计；无 `localStorage/sessionStorage` 承载业务数据。
- `setTimeout` 仅用于：评分状态轮询退避、HTTP 重试退避（均为合理用途）。
- 外部 Provider 调用失败时**不会**回退到假数据：
  - 生成接口：缺 Key / Provider 错误 → 明确 5xx（`AI_NOT_CONFIGURED` 等）。
  - 评分：LLM 精修失败 → 回退到**由转写文本 + 时长真实计算的基线分**（非伪造）。

## 4. API Reality Matrix

| Endpoint | Method | Auth | Validation | DB | Provider | 真实? |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/auth/register` | POST | — | Zod | INSERT 事务 | — | ✅ |
| `/api/auth/[...nextauth]` | GET/POST | — | 限流 | SELECT | OAuth | ✅ |
| `/api/exercises/generate` | POST | ✅ | Zod | 锁 + INSERT | DeepSeek | ✅ |
| `/api/exercises/today` | GET | ✅ | 参数校验 | SELECT | — | ✅（+限流） |
| `/api/uploads/audio` | POST/PATCH | ✅ | Zod | upsert | R2 / 本地 | ✅ |
| `/api/uploads/audio/body` | POST | ✅ | 头校验 | — | 本地磁盘 | ✅ |
| `/api/assessments` | POST/GET | ✅ | Zod | UPDATE/SELECT | STT + DeepSeek | ✅ |
| `/api/progress/history` | GET | ✅ | — | SELECT JOIN | — | ✅ |
| `/api/progress/calendar` | GET | ✅ | 正则 | SELECT（按月有界） | — | ✅ |
| `/api/progress/[exerciseId]/audio` | GET | ✅ | — | SELECT | R2 签名 / 本地流 | ✅ |
| `/api/progress/[exerciseId]` | DELETE | ✅ | — | DELETE + 存储清理 | R2 / 本地 | ✅ |
| `/api/settings` | GET/PATCH | ✅ | Zod（含时区） | SELECT/upsert | — | ✅ |
| `/api/account` | PATCH/DELETE | ✅ | Zod | UPDATE/DELETE | 存储清理 | ✅ |
| `/api/account/password` | POST | ✅ | Zod + 旧密码校验 | UPDATE | — | ✅ |
| `/api/cron/assessments` | GET | Cron Secret | — | claim/update | STT + DeepSeek | ✅ |

**已移除**：`/api/progress/checkin` — 全仓库无调用方，且写入 `completed` 却不含评分（不计入连续天数），属历史遗留死端点。

## 5. Database Reality Audit

- 实体：`users` / `user_credentials` / `oauth_accounts` / `user_settings` / `exercises` / `exercise_generation_locks` / `user_progress`。
- CRUD 真实：注册（事务 INSERT）、读取（SELECT/JOIN）、进度 upsert（`onConflictDoUpdate`）、删除（`ON DELETE cascade` + 存储清理）。
- 约束齐全：外键 cascade、唯一约束 `(user_id, exercise_id)`、`(date, language, exercise_index)`、`users.email/phone` unique、PK。
- 迁移与 schema 同步（`drizzle/0000–0003`）。
- 刷新不丢数据：`user_progress` 持久化评分与录音 key，`exercises` 持久化当日题库；`/api/exercises/today` 负责恢复。
- 未做危险操作：无 DB reset，无破坏性迁移。

## 6. External Integrations

| 集成 | 真实调用 | 超时 | 重试 | 失败可见 |
| --- | --- | --- | --- | --- |
| DeepSeek 生成 | ✅ | 60s | ✅ 2 次退避 | ✅ 502/503 |
| DeepSeek 评分精修 | ✅ | 60s | ✅ 2 次退避 | ✅ 回退基线分 |
| OpenAI 兼容 STT | ✅ | 90s | ✅ 2 次退避 | ✅ 失败态入库 |
| Cloudflare R2 | ✅（配置后） | SDK | — | ✅ |
| Upstash Redis | ✅（配置后） | SDK | — | ✅ 503 / 自托管开关 |

## 7. Security Audit

- 所有 API 从会话取 `userId`，绝不信任请求体；全部按 `userId` 过滤（无 IDOR）。
- 密码 `bcrypt` cost 12；改密需校验当前密码。
- 录音对象 key 强制前缀 `audio/{userId}/{exerciseId}/`，跨用户越权上传/确认被拒。
- Secret 仅服务端读取；`NEXTAUTH_SECRET`、Provider Key 不进入客户端 bundle（无 `NEXT_PUBLIC_*` 泄露）。
- 输入统一 Zod 校验；无 SQL 拼接（Drizzle 参数化）；React 文本渲染，无 `dangerouslySetInnerHTML`。
- 登录/注册/生成/上传/评分/查询全部限流。
- 新增：安全响应头（nosniff / DENY / Referrer-Policy / Permissions-Policy / HSTS）。
- `.env.local` 已被 `.gitignore` 覆盖，且**未被提交**（仓库仅跟踪 `.env.example`）。

## 8. 本轮修改清单（按优先级）

**P0**

1. **修复录音上传核心链路**：`isR2Configured()` 会把 `.env.example` 占位值当成真实 R2，导致本地兜底存储被跳过、上传全部指向不存在的端点而失败。现忽略占位值（与既有 Upstash 处理一致），并抽出可测试的 `src/lib/audio-storage-config.ts` + 回归测试。

**P1**

2. **时区口径统一**：`/api/exercises/generate` 与 `/api/exercises/today` 原先固定用 `Asia/Shanghai`，与打卡日历/连续天数（用用户时区）不一致。现统一经 `src/lib/user-settings.ts → getUserTimeZone()`。
3. **时区校验**：`/api/settings` 的 `timeZone` 原先接受任意字符串，非法 IANA 值会让日期接口抛 `RangeError` → 500。现用 `isValidTimeZone` 校验，并新增 `resolveTimeZone` 防御性归一。

**P2**

4. **路由守卫前移**：新增 `src/proxy.ts`（Next.js 16 约定），未登录访问 `/`、`/records`、`/settings` 直接 307 到 `/login`；已登录访问登录/注册页回到首页。
5. **安全响应头**：`next.config.ts` 增加 nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy（显式允许 `microphone=(self)`）/ 生产 HSTS。
6. **错误边界**：新增 `src/app/error.tsx`、`src/app/not-found.tsx`。
7. **Provider 重试**：新增 `src/lib/http.ts`（`fetchWithRetry`，指数退避 + 超时，仅重试瞬时错误），用于生成/转写/评分。
8. **错误分层**：生成接口对 `AI_NOT_CONFIGURED` / `AI_PROVIDER_ERROR` / `AI_RESPONSE_INVALID` 返回 503/502 明确语义，不再一律 500。
9. **自托管可用性**：生产环境无 Upstash 时默认仍 fail-closed，但允许 `RATE_LIMIT_ALLOW_IN_MEMORY=1` 显式启用进程内限流（原实现无法自托管）。
10. **限流数值校准**：`assessmentStatus` 600/h → 3000/h，避免轮询误触 429。
11. **日历有界查询**：由「拉全表再 JS 过滤」改为「按月 ±1 天 SQL 过滤」。
12. **今日接口限流**：`/api/exercises/today` 补充限流（新策略 `exercisesToday`）。
13. **前端一致性**：首页切换每日篇数后按新数量重载今日挑战展示。

**P3**

14. **去重**：新增 `src/lib/exercise-queries.ts`，消除 `generate` / `today` 两个路由约 100 行重复的题库+进度查询逻辑。
15. **移除未使用依赖**：`@neondatabase/serverless`（驱动已切换为 `postgres`）。
16. **文档**：重写 `README.md`（架构 / 环境变量 / 部署 / 脚本）；`.env.example` 补充 `RATE_LIMIT_ALLOW_IN_MEMORY`。

## 9. Tests

- 单元测试：`vitest run` → **12 文件 / 104 用例通过**（新增 `http.test.ts`、`audio-storage-config.test.ts`，扩充 `date.test.ts`）。
- Lint：`eslint` 通过。
- Typecheck：`tsc --noEmit` 通过。
- Build：`next build` 成功（21 路由，Proxy 生效）。
- 运行时验证（`next start`）：
  - `GET /`、`/settings`、`/records` → 307 → `/login` ✅
  - `GET /login` → 200 ✅
  - `GET /api/exercises/today`、`/api/settings` → 401 JSON ✅
  - 安全响应头全部存在 ✅

## 10. Remaining Issues

**P0** — 无。

**P1**
- 邮箱验证 / 找回密码缺失（依赖邮件服务，属外部阻塞）。

**P2**
- 无结构化日志 / 请求 ID（当前为 `console.*` 带前缀）。
- 无 API 集成 / E2E 测试（缺少一次性测试数据库与 Provider 替身环境）。
- `/api/progress/history` 的连续天数统计仍会读取当前用户全部已完成记录（`totalDays`/`best` 语义要求全量；单用户规模可接受）。
- 账号删除后，已签发的 JWT 在过期前仍可读取（写操作因数据已删除而无效）；未实现会话吊销。

**P3**
- 成就仅在前端派生展示，无「解锁时刻」持久化与提示。
- 前端未做 data-fetch 层抽象（各页面直接 `fetch`）。

## 11. External Blockers

| 事项 | 需要的凭据/资源 |
| --- | --- |
| AI 生成与评分 | `DEEPSEEK_API_KEY`（真实 Key） |
| 语音转写 | `TRANSCRIPTION_API_KEY` 或 `OPENAI_API_KEY` |
| 生产对象存储 | Cloudflare R2 账号与密钥 |
| 生产限流 | Upstash Redis 实例 |
| 邮件验证 / 找回密码 | 邮件服务（当前功能未实现） |
| 端到端演练 | 可用的 PostgreSQL 实例（本地 `daily_speech` 库） |

> 上述功能均已实现到「只差真实凭据即可运行」，且缺少凭据时会给出明确错误而非伪造结果。

## 12. Production Readiness

| 领域 | 分数 | 说明 |
| --- | --- | --- |
| Frontend | 88 | 加载/空/错误态齐全，新增错误边界；缺 data-fetch 抽象与 E2E |
| Backend | 90 | 真实业务逻辑、事务、并发守卫、重试与错误分层 |
| Database | 92 | schema/迁移/约束/索引完备，CRUD 真实 |
| Auth | 88 | 服务端鉴权 + 边缘守卫 + 限流；缺邮箱验证与会话吊销 |
| Storage | 85 | R2 直传 + 本地兜底（占位值识别已修复）；本地兜底不适用于无状态部署 |
| AI | 85 | 真实调用、超时、重试、失败可见；缺 token/成本用量统计 |
| Testing | 70 | 纯函数单测充分；缺集成/E2E |
| Security | 88 | 无 IDOR/无 secret 泄漏/输入校验/安全头；缺结构化审计日志 |

**Overall Production Readiness Score: 87 / 100**

