# 易知校读器 · Render 云端部署指南

目标：把本工具部署成公网固定链接，去掉本地隧道（lhr.life）的限制，让所有人、所有时候都能访问。

## 一、为什么用 Render

- 支持 Docker 部署（自带 ffmpeg 依赖），公网固定 URL。
- 免费套餐可跑 Node Web Service，适合这个纯本机运算的工具（不依赖外部 API key）。
- 模型（whisper-tiny / tesseract 中文包）运行时在线下载，镜像体积可控。

## 二、前提

1. 一个 GitHub 账号（用来托管代码）。
2. 一个 Render 账号（可用 GitHub 直接登录）：https://render.com

## 三、部署步骤（约 10 分钟）

### 第 1 步：把项目推到 GitHub

1. 在本机项目目录 `yizhi-proofreader-deploy/` 里执行：

   ```bash
   git init
   git add .
   git commit -m "yizhi-proofreader v1.8.0"
   ```

2. 在 GitHub 新建一个**私有**仓库（仓库名随意，如 `yizhi-proofreader`）。
3. 关联并推送：

   ```bash
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/yizhi-proofreader.git
   git push -u origin main
   ```

> 建议设为私有仓库：源码是内部工具，不公开。

### 第 2 步：在 Render 创建服务（用 Blueprint，最省事）

1. 登录 https://render.com → 右上角 **New +** → 选 **Blueprint**。
2. 选择你刚推送的 GitHub 仓库。
3. Render 会自动读取仓库里的 `render.yaml`，识别出一个 Web Service。
4. 点 **Apply**，开始构建。

构建约 3–5 分钟（安装 ffmpeg + npm 依赖）。

### 第 3 步：确认公开访问

构建完成后，Render 会给你一个形如
`https://yizhi-proofreader.onrender.com` 的链接。

- 打开后能看到「易知校读器」上传页 = 成功。
- 本项目 `ACCESS_CODE` 已留空 = 公开访问，任何人打开链接即可用，无需口令。

### 第 4 步：免费实例防休眠（关键，做到"所有时候可用"）

Render 免费 Web Service **空闲 15 分钟会休眠**，下次访问需冷启动约 30–60 秒。
要真正做到"所有时候可用"，二选一：

- **方案 A（免费）**：用外部 Uptime 服务定时 ping，防止进入休眠。
  - 注册 https://uptimerobot.com（免费），新建一个 HTTP 监控，URL 填你的 onrender 链接，间隔 5 分钟。
  - 或用 https://cron-job.org 每 10 分钟请求一次首页。
- **方案 B（付费，真正 7×24）**：在 Render 服务页 → **Settings** 里把实例升级到 Starter 套餐（约 $7/月），实例永不休眠。

> 注意：Uptime 保活只是"唤醒"级别，免费实例本身仍受 750 小时/月额度约束，个人使用足够。

## 四、可选：加访问口令

如果之后想限制访问，在 Render 服务页 → Environment → 把 `ACCESS_CODE` 设成任意非空值，
上传页会要求输入该口令。留空即恢复公开。

## 五、已做的改造（说明）

- `Dockerfile`：补上 `HF_HOME`/`TESSDATA_PREFIX` 模型缓存目录 + 权限 + Node 堆内存限制（适配免费实例 512MB）。
- `render.yaml`：Blueprint 部署配置，Web Service + Docker + 公开访问环境变量。

## 六、常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 首次转写音视频很慢 | 首次在线下载 whisper-tiny 模型（约 40MB），之后有缓存会快 |
| 长视频转写报错/超时 | 免费实例内存有限，建议先传短音频，或升级套餐 |
| 打开链接要等半分钟 | 免费实例休眠冷启动，正常；用保活方案规避 |
| 上传后提示网络断开 | 免费实例偶尔重启，刷新重试即可 |
