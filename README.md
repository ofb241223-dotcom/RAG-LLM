# RAG Intelligent Document Q&A

Course-design Web application for document question answering with RAG.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: Spring Boot, MySQL-ready persistence, JWT-style API boundary
- RAG service: FastAPI, Chroma, Tongyi embeddings, DeepSeek LLM

## Supported Documents

- PDF
- TXT
- Word `.docx`
- Word `.doc` through LibreOffice conversion

## Local Runtime Layout

- `frontend/`: browser UI
- `backend/`: Spring Boot business API
- `rag-service/`: Python RAG pipeline
- `docs/ui-reference/`: reference screenshots used to recreate the design

Runtime uploads, vector indexes, environment files, and generated build outputs are ignored by git.
