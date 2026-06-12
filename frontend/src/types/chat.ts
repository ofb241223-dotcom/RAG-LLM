export interface CitationDto {
  documentId: number;
  filename: string;
  chunkId: string;
  score: number;
  text: string;
  page?: number;
}

export interface ChatAskRequest {
  question: string;
  documentIds: number[];
  topK?: number;
}

export interface ChatAnswerDto {
  answer: string;
  sources: CitationDto[];
}
