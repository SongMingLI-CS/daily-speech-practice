# 每日口才打卡 · Daily Speech Practice

一个真实数据驱动的全栈口才训练应用：**AI 生成每日朗读素材 → 浏览器录音 → 云端语音转写 → AI 评分与反馈 → 打卡 / 连续天数 / 成就 / 趋势**。

所有业务数据均持久化在 PostgreSQL，录音存放于对象存储（Cloudflare R2，或自托管时的本地磁盘），AI 能力真实调用外部 Provider。代码中不存在生产路径的 mock / 假数据。

## 功能

- 邮箱密码注册登录（`bcryptjs`）+ 可选 Google / GitHub OAuth
- DeepSeek 生成中/英每日朗读素材（按日期入库，全员共享当日题库，带生成锁防并发重复生成）
- 浏览器 `MediaRecorder` 录音 → 对象存储 → OpenAI 兼容语音转写 → DeepSeek 评分（发音/流利/完整 + 反馈）
- 逐句差异对照（LCS 对齐，高亮遗漏）、单句重练、评分趋势图、月历打卡、连续天数与成就
- 打卡记录回听 / 删除、个人设置（默认语言 / 每日篇数 / 时区）、账号改名 / 改密 / 注销

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router / Turbopack）+ React 19 |
| 语言 | TypeScript（strict） |
| 样式 | Tailwind CSS v4 |
| 认证 | NextAuth.js v4（JWT strategy） |
| 数据库 | PostgreSQL（`postgres` / postgres-js 驱动）+ Drizzle ORM |
| 对象存储 | Cloudflare R2（S3 兼容）；未配置时回退本地磁盘 |
| 限流 | Upstash Redis（滑动窗口）；开发环境回退进程内限流 |
| AI | DeepSeek（生成/评分）、任意 OpenAI 兼容 STT（转写） |
| 校验 | Zod |
| 测试 | Vitest |

## 架构

```
Browser (React 19 client components)
   ↓  fetch /api/*
Next.js Route Handlers (app/api/**)      ← 会话校验 + Zod 校验 + 限流
   ↓
src/lib/*  （业务逻辑：评分流水线、题目查询、存储、限流、时间）
   ↓
Drizzle ORM → PostgreSQL

外部 Provider：DeepSeek · OpenAI 兼容 STT · Cloudflare R2 · Upstash Redis
```

服务端路由守卫位于 `src/proxy.ts`（Next.js 16 的 proxy 约定，即原 middleware）。

## 快速开始

```bash
npm install
cp .env.example .env.local     # 至少填 DATABASE_URL / NEXTAUTH_SECRET / NEXTAUTH_URL
npm run db:migrate             # 应用 drizzle 迁移
npm run dev                    # http://localhost:3000
```

要完整体验录音与评分，还需配置 `DEEPSEEK_API_KEY` 与 `TRANSCRIPTION_API_KEY`。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 连接串 |
| `NEXTAUTH_URL` | ✅ | 站点地址，如 `https://example.com` |
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -base64 32` 生成 |
| `DEEPSEEK_API_KEY` | ✅（生成/评分） | 未配置时相关接口返回明确的 `AI_NOT_CONFIGURED`，不会伪造结果 |
| `TRANSCRIPTION_API_KEY` | ✅（语音评分） | 未配置时回退 `OPENAI_API_KEY` |
| `OPENAI_TRANSCRIPTION_BASE_URL` / `OPENAI_TRANSCRIPTION_MODEL` / `OPENAI_TRANSCRIPTION_EXTRAS` | — | 指向任意 OpenAI 兼容 STT 服务 |
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | 生产推荐 | 未配置时录音写入本地 `data/audio`（仅适用于有持久磁盘的单实例） |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 生产必填 | 分布式限流 |
| `RATE_LIMIT_ALLOW_IN_MEMORY` | — | 单实例自托管设为 `1`，允许生产环境使用进程内限流 |
| `CRON_SECRET` | — | 保护 `/api/cron/assessments`（Vercel Cron 自带 `x-vercel-cron` 头） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GITHUB_ID` / `GITHUB_SECRET` | — | 可选 OAuth |

> 占位值（`replace-me`、`your-account-id` 等）会被识别为「未配置」，不会被当作真实凭据。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest 单元测试 |
| `npm run db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle 迁移与可视化 |

## 数据模型

`users` · `user_credentials` · `oauth_accounts` · `user_settings` · `exercises` · `exercise_generation_locks` · `user_progress`（见 `src/db/schema.ts` 与 `drizzle/`）。

## 部署

- **Vercel**：配置全部生产环境变量（数据库 / 认证 / R2 / Upstash / DeepSeek / STT），`vercel.json` 已注册每 5 分钟清扫超时评分任务的 Cron。
- **自托管**：单实例可直接使用本地磁盘存储 + `RATE_LIMIT_ALLOW_IN_MEMORY=1`；多实例必须配置 R2 与 Upstash。

## 质量

CI（`.github/workflows/ci.yml`）在 push / PR 时依次执行 lint、typecheck、单元测试与生产构建。

详细审计结论见 [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md)。
