FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=7860 \
    # HuggingFace 模型缓存目录（whisper-tiny 等运行时下载到此）
    HF_HOME=/app/.cache/huggingface \
    # tesseract 语言包缓存目录（chi_sim 运行时下载到此）
    TESSDATA_PREFIX=/app/.cache/tessdata \
    # 限制 Node 堆内存，适配 Render 免费实例（512MB）跑 whisper 时不至于 OOM
    NODE_OPTIONS=--max-old-space-size=384

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server.js ./
COPY src ./src
COPY public ./public

# 预创建模型缓存目录并赋权给 node 用户，确保运行时在线下载模型有处可写
RUN mkdir -p /app/.cache/huggingface /app/.cache/tessdata \
  && chown -R node:node /app

USER node
EXPOSE 7860
CMD ["node", "server.js"]
