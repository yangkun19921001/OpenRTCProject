#!/bin/bash

# 设置环境变量
export HTTPS=true

# 启动 Node.js 服务
nohup node server.js > server.log 2>&1 &

echo "server.js 服务已在后台启动"

