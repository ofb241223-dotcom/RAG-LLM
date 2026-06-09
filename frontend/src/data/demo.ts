import { Box, CheckCircle2, CloudUpload, Database, FileText, MessageSquareMore, SearchCheck, type LucideIcon } from 'lucide-react';
import type { DocumentDto } from '../types/document';

export interface DashboardStat {
  label: string;
  value: string;
  unit: string;
  metaLabel: string;
  trend: string;
  icon: LucideIcon;
  tone: 'blue' | 'green' | 'purple' | 'orange';
}

export interface ProcessStep {
  label: string;
  detail: string;
  icon: LucideIcon;
  tone: 'blue' | 'cyan' | 'green' | 'purple';
}

export const demoDocuments: DocumentDto[] = [
  {
    id: 101,
    originalFilename: '《深度学习原理与实践》第3章.pdf',
    format: 'PDF',
    status: 'READY',
    sizeBytes: 12.4 * 1024 * 1024,
    uploadedAt: '2024-05-20T14:32:00+08:00',
    updatedAt: '2024-05-20T14:32:00+08:00',
    chunkCount: 42,
    vectorCount: 42,
  },
  {
    id: 102,
    originalFilename: '自然语言处理综述.docx',
    format: 'DOCX',
    status: 'READY',
    sizeBytes: 3.2 * 1024 * 1024,
    uploadedAt: '2024-05-20T11:08:00+08:00',
    updatedAt: '2024-05-20T11:10:00+08:00',
    chunkCount: 18,
    vectorCount: 18,
  },
  {
    id: 103,
    originalFilename: '实验记录与结果分析.txt',
    format: 'TXT',
    status: 'READY',
    sizeBytes: 1.2 * 1024 * 1024,
    uploadedAt: '2024-05-18T09:15:00+08:00',
    updatedAt: '2024-05-18T09:15:00+08:00',
    chunkCount: 8,
    vectorCount: 8,
  },
];

export const demoStats: DashboardStat[] = [
  {
    label: '文档总数',
    value: '128',
    unit: '份',
    metaLabel: '较上周',
    trend: '↑ 12.5%',
    icon: FileText,
    tone: 'blue',
  },
  {
    label: '已解析文档',
    value: '112',
    unit: '份',
    metaLabel: '解析成功率',
    trend: '87.5%',
    icon: CheckCircle2,
    tone: 'green',
  },
  {
    label: '对话总数',
    value: '362',
    unit: '次',
    metaLabel: '较上周',
    trend: '↑ 18.3%',
    icon: MessageSquareMore,
    tone: 'purple',
  },
  {
    label: '向量总数',
    value: '1,245',
    unit: '个',
    metaLabel: '当前索引',
    trend: '',
    icon: Database,
    tone: 'orange',
  },
];

export const processSteps: ProcessStep[] = [
  { label: '上传文档', detail: '支持多种格式文档上传', icon: CloudUpload, tone: 'blue' },
  { label: '文本解析', detail: '提取文档中的文本内容', icon: FileText, tone: 'cyan' },
  { label: '文本分块', detail: '将长文本切分为语义块', icon: Box, tone: 'green' },
  { label: '向量化', detail: '生成向量并存储到向量库', icon: Database, tone: 'purple' },
  { label: '检索问答', detail: '检索相关内容并生成答案', icon: SearchCheck, tone: 'blue' },
];

export const demoActivities = [
  { label: '上传了文档《深度学习原理与实践》第3章.pdf', time: '2024-05-20 14:32', tone: 'blue' },
  { label: '文档《自然语言处理综述.docx》解析完成', time: '2024-05-20 11:10', tone: 'green' },
  { label: '与文档《深度学习原理与实践》进行了问答', time: '2024-05-20 10:45', tone: 'purple' },
  { label: '向量库更新完成，新增 1,245 个向量', time: '2024-05-19 18:22', tone: 'orange' },
] as const;
