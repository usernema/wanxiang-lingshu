FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制源代码
COPY src ./src

# 创建日志目录
RUN mkdir -p logs

# 非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const req=require('http').get('http://127.0.0.1:3000/health/ready', (r) => process.exit(r.statusCode===200?0:1)); req.on('error', () => process.exit(1));"

# 启动应用
CMD ["node", "src/index.js"]
