# RAG 智能文档问答系统

这是一个课程设计项目，目标是实现一个可运行的智能文档问答平台。系统支持上传 PDF、TXT、Word、Excel 文档，后端会调用 Python RAG 服务解析文档、切分文本、生成向量并写入向量库；用户可以在前端围绕已上传文档进行问答，回答支持 Markdown 与 LaTeX 渲染，并保留对话历史和引用片段。

## 功能概览

- 文档上传：支持 PDF、TXT、DOCX、DOC、XLSX、XLS。
- 文档解析：自动完成文本提取、分块、Embedding、向量入库。
- 文档中心：查看文档状态、分块数、向量数，支持重新处理、删除、下载原文。
- 文档处理详情：查看处理流程、真实文本块预览、向量库和模型配置。
- 文档问答：按当前文档检索 Top-K 片段，生成带引用的回答。
- 流式输出：设置中开启后，问答接口会使用 NDJSON 流式返回。
- 对话历史：按文档管理会话，支持新建、切换、删除、导出。
- 系统设置：选择 LLM、Embedding 模型，配置 RAG 参数并自动写入后端数据库。
- 持久化：文档、设置、会话、消息、引用均保存到 MySQL。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | React、Vite、TypeScript、Lucide Icons、Markdown/KaTeX 渲染 |
| 后端 | Spring Boot、JDBC、MySQL、REST API |
| RAG 服务 | FastAPI、Chroma、Google Gemini / OpenRouter / OpenAI-compatible Provider |
| 向量库 | Chroma 持久化存储 |
| 测试 | Vitest、JUnit、Pytest |

## 目录结构

```text
RAG-LLM/
├── frontend/           # React 前端
├── backend/            # Spring Boot 后端 API
├── rag-service/        # Python FastAPI RAG 服务
├── docs/ui-reference/  # UI 参考图
├── .env.example        # 环境变量模板，不包含真实密钥
└── README.md
```

说明：`backend/src/test`、`frontend/src/**/*.test.tsx`、`rag-service/tests` 是项目测试代码，用来证明接口、页面和 RAG 流程可以被自动验证，不是无关文件。

## 环境要求

建议使用 Ubuntu/Linux 环境运行。

- Node.js 20+
- Java 21+
- Maven 3.9+
- Python 3.11+
- MySQL 8+
- LibreOffice，只有解析 `.doc` 老 Word 文件时需要

检查命令示例：

```bash
node -v
npm -v
java -version
mvn -v
python3 --version
mysql --version
```

## 首次运行

### 1. 克隆项目

```bash
git clone https://github.com/ofb241223-dotcom/RAG-LLM.git
cd RAG-LLM
```

### 2. 准备环境变量

复制模板：

```bash
cp .env.example .env
```

编辑 `.env`，至少需要配置：

```properties
BACKEND_PORT=8080
FRONTEND_PORT=5176
RAG_SERVICE_PORT=8000

RAG_DB_URL=jdbc:mysql://localhost:3306/rag_llm?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
RAG_DB_USERNAME=rag_llm
RAG_DB_PASSWORD=rag_llm_password

MODEL_PROVIDER=google
GOOGLE_EMBEDDING_API_KEY=你的_Google_Embedding_Key
GOOGLE_LLM_API_KEY=你的_Google_LLM_Key
GOOGLE_EMBEDDING_MODEL=gemini-embedding-001
GOOGLE_LLM_MODEL=gemini-3.1-flash-lite
```

如果要使用 OpenRouter，可以同时配置：

```properties
OPENROUTER_API_KEY=你的_OpenRouter_Key
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
```

注意：`.env` 已被 `.gitignore` 忽略，不要把真实 API Key 提交到仓库。

### 3. 创建 MySQL 数据库和用户

如果本机还没有数据库，可以用 root 用户执行：

```sql
CREATE DATABASE IF NOT EXISTS rag_llm
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'rag_llm'@'localhost'
  IDENTIFIED BY 'rag_llm_password';

GRANT ALL PRIVILEGES ON rag_llm.* TO 'rag_llm'@'localhost';
FLUSH PRIVILEGES;
```

后端启动时会自动初始化需要的表结构。

### 4. 安装依赖

前端依赖：

```bash
cd frontend
npm install
cd ..
```

Python RAG 服务依赖：

```bash
cd rag-service
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cd ..
```

后端 Maven 依赖会在第一次启动或测试时自动下载。

## 启动项目

项目需要同时启动 3 个服务：RAG 服务、Spring Boot 后端、React 前端。请分别打开 3 个终端，先进入项目根目录，再按下面顺序复制命令执行。

如果是刚 clone 下来的项目，先进入项目目录：

```bash
cd RAG-LLM
```

终端 1，启动 RAG 服务：

```bash
cd rag-service
.venv/bin/uvicorn rag_service.main:app --host 0.0.0.0 --port 8000
```

终端 2，启动后端：

```bash
cd backend
set -a
source ../.env
set +a
mvn spring-boot:run -Dspring-boot.run.arguments='--server.port=8080'
```

终端 3，启动前端：

```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8080/api npm run dev -- --host 0.0.0.0 --port 5176
```

三个终端都启动成功后，打开：

```text
前端页面:   http://127.0.0.1:5176/
后端状态:   http://127.0.0.1:8080/api/status
RAG 状态:   http://127.0.0.1:8000/health
后端接口:   http://127.0.0.1:8080/swagger-ui/index.html
RAG 接口:    http://127.0.0.1:8000/docs
```

重启某个服务时，在对应终端按 `Ctrl+C` 停止，再重新执行该终端的启动命令即可。如果想检查端口是否已经被占用：

```bash
lsof -i :5176
lsof -i :8080
lsof -i :8000
```

如果需要停止某个端口上的旧进程，可以先用 `lsof` 找到 PID，再执行：

```bash
kill <PID>
```

## 使用流程

1. 打开 `http://127.0.0.1:5176/`。
2. 进入“系统设置”，确认 LLM、Embedding、RAG 策略。
3. 进入“上传文档”，上传 PDF、TXT、Word 或 Excel 文件。
4. 上传完成后进入“文档中心”，确认状态为“已完成”。
5. 点击文档详情，可以查看真实文本块和处理流程。
6. 进入“文档问答”，选择文档并提问。
7. 进入“对话历史”，查看、切换或删除历史会话。

## 接口可视化与请求日志

课堂演示时可以打开两个接口 UI：

```text
Spring Boot Swagger UI: http://127.0.0.1:8080/swagger-ui/index.html
FastAPI RAG Docs:       http://127.0.0.1:8000/docs
```

后端还提供最近请求日志，能看到浏览器到 Spring Boot、Spring Boot 到 RAG、RAG 到模型或 MinerU 的调用摘要：

```bash
curl 'http://127.0.0.1:8080/api/observability/requests?limit=50'
curl -X DELETE 'http://127.0.0.1:8080/api/observability/requests'

curl 'http://127.0.0.1:8000/observability/requests?limit=50'
curl -X DELETE 'http://127.0.0.1:8000/observability/requests'
```

日志只记录方法、路径、状态码、耗时、模型名和摘要，不记录 API Key、Authorization、文件正文或大段请求体。

## 模型配置说明

当前默认推荐：

- LLM：`gemini-3.1-flash-lite`
- Embedding：`gemini-embedding-001`
- 向量库：`Chroma`

系统设置页面只负责选择模型和参数，不在前端填写 API Key。API Key 由 `.env` 提供，并由后端/RAG 服务读取。

可选模型会出现在系统设置页面中，包括 Google AI Studio 和 OpenRouter 的部分模型。模型是否可用取决于你的 API Key、账号额度和网络环境。当前已验证的 Google Embedding 选项是 `gemini-embedding-001` 和 `gemini-embedding-2`；`gemini-embedding-002` 不支持本项目当前使用的 `embedContent` 调用方式，因此不放入前端选项。OpenRouter Embedding 默认使用 `openai/text-embedding-3-small`。

命令行测试 Google 模型连接：

```bash
curl -s 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent' \
  -H 'Content-Type: application/json' \
  -H "x-goog-api-key: ${GOOGLE_LLM_API_KEY}" \
  -d '{"contents":[{"parts":[{"text":"请用一句话回复连接测试。"}]}]}'

curl -s 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent' \
  -H 'Content-Type: application/json' \
  -H "x-goog-api-key: ${GOOGLE_EMBEDDING_API_KEY}" \
  -d '{"content":{"parts":[{"text":"连接测试"}]},"taskType":"RETRIEVAL_QUERY"}'
```

命令行测试 OpenRouter：

```bash
curl -s 'https://openrouter.ai/api/v1/chat/completions' \
  -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"model":"openai/gpt-oss-120b:free","messages":[{"role":"user","content":"请用一句话回复连接测试。"}]}'

curl -s 'https://openrouter.ai/api/v1/embeddings' \
  -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"model":"openai/text-embedding-3-small","input":["连接测试"]}'
```

## 测试与构建

RAG 服务测试：

```bash
cd rag-service
.venv/bin/pytest -q
```

后端测试：

```bash
cd backend
mvn test
```

前端测试：

```bash
cd frontend
npm test -- --run
```

前端生产构建：

```bash
cd frontend
npm run build
```

## 健康检查

启动后可以用以下命令确认服务正常：

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8080/api/status
curl http://127.0.0.1:8080/api/settings
curl http://127.0.0.1:8080/api/documents?size=5
```

如果前端提示“后端服务不可用”，先确认：

```bash
curl http://127.0.0.1:8080/api/status
```

如果 `curl` 返回 200，说明后端已启动，前端提示可能是后端重启期间留下的临时消息，刷新页面即可。

## 常见问题

### 1. 端口被占用

默认端口：

- 前端：`5176`
- 后端：`8080`
- RAG：`8000`

可以在 `.env` 中改：

```properties
FRONTEND_PORT=5177
BACKEND_PORT=8081
RAG_SERVICE_PORT=8001
VITE_API_BASE_URL=http://127.0.0.1:8081/api
RAG_SERVICE_URL=http://127.0.0.1:8001
```

### 2. MySQL 连接失败

检查数据库、用户名、密码是否和 `.env` 一致：

```bash
mysql -urag_llm -prag_llm_password rag_llm
```

### 3. RAG 服务连接失败

检查 RAG 服务：

```bash
curl http://127.0.0.1:8000/health
tail -n 80 .runtime/logs/rag-service.log
```

### 4. 模型测试失败

常见原因：

- `.env` 没有填真实 API Key。
- 当前网络无法访问模型服务。
- 模型名称不可用或账号没有额度。
- OpenRouter 免费模型临时不可用。

### 5. Word `.doc` 解析失败

`.docx` 可以直接解析，老格式 `.doc` 通常需要本机安装 LibreOffice：

```bash
sudo apt install libreoffice
```

## 安全说明

- 不要提交 `.env`。
- 不要把真实 API Key 写入 README、测试或前端代码。
- 前端设置页面不保存密钥，只保存模型和参数。
- 公开仓库中只保留 `.env.example` 作为模板。

## 当前开发状态

目前已经打通：

- MySQL 持久化
- 文档上传、解析、向量入库
- PDF / TXT / Word / Excel 支持
- 文档详情真实文本块查看
- 文档问答和引用片段
- 流式问答接口
- 对话历史管理
- 系统设置持久化

后续可继续优化：

- 逐页对照 UI 设计图精修视觉细节
- 增加更细的文档解析指标
- 增加用户登录和权限
- 增加 Docker Compose 部署方式
