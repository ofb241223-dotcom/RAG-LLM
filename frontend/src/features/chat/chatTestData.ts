import type { ChatCitationDto, ChatDocumentDto, ChatSessionDetailDto, ChatSessionSummaryDto } from '../../api/chat';

export const chatDocuments: ChatDocumentDto[] = [
  {
    id: 1,
    originalFilename: '《深度学习原理与实践》第3版.pdf',
    format: 'PDF',
    sizeBytes: 12.4 * 1024 * 1024,
    chunkCount: 128,
    vectorCount: 128,
    sessionCount: 1,
    lastActiveAt: '2024-05-20T10:23:00+08:00',
  },
  {
    id: 2,
    originalFilename: '自然语言处理综述.docx',
    format: 'DOCX',
    sizeBytes: 3.2 * 1024 * 1024,
    chunkCount: 86,
    vectorCount: 86,
    sessionCount: 0,
    lastActiveAt: null,
  },
];

export const citation: ChatCitationDto = {
  key: '102:1:98_3',
  markerIndex: 1,
  documentId: 1,
  filename: '《深度学习原理与实践》第3版.pdf',
  chunkId: '98_3',
  score: 0.92,
  text: '多头注意力允许模型在不同表示子空间中关注输入序列的不同位置。',
  page: 98,
};

export const sessionSummaries: ChatSessionSummaryDto[] = [
  {
    id: 11,
    documentId: 1,
    title: 'Transformer 架构详解与注意力机制',
    status: 'ACTIVE',
    messageCount: 2,
    createdAt: '2024-05-20T10:21:00+08:00',
    updatedAt: '2024-05-20T10:23:00+08:00',
  },
];

export const sessionDetail: ChatSessionDetailDto = {
  id: 11,
  document: chatDocuments[0],
  title: 'Transformer 架构详解与注意力机制',
  status: 'ACTIVE',
  createdAt: '2024-05-20T10:21:00+08:00',
  updatedAt: '2024-05-20T10:23:00+08:00',
  messages: [
    {
      id: 101,
      role: 'USER',
      content: '请详细解释 Transformer 架构中的多头注意力机制的工作原理，并举例说明。',
      status: 'SUCCESS',
      createdAt: '2024-05-20T10:21:00+08:00',
      citations: [],
    },
    {
      id: 102,
      role: 'ASSISTANT',
      content:
        '根据文档内容，Transformer 的核心组成部分主要包括：\n\n1. **多头注意力（Multi-Head Self-Attention）**：允许模型在不同表示子空间中关注输入序列的不同位置。[1]\n\n注意力计算可写作 $QK^T$。',
      status: 'SUCCESS',
      createdAt: '2024-05-20T10:21:10+08:00',
      citations: [citation],
    },
  ],
};
