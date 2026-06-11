import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { ChatCitationDto } from '../../../api/chat';
import { findCitationByMarker } from '../chatFormat';

interface AnswerContentProps {
  content: string;
  citations: ChatCitationDto[];
  messageId: number;
  onSelectCitation: (citation: ChatCitationDto) => void;
}

export function AnswerContent({ content, citations, messageId, onSelectCitation }: AnswerContentProps) {
  const parts = content.split(/(\[\d+\])/g);

  return (
    <div className="answer-content markdown-body" data-testid={`assistant-answer-${messageId}`}>
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) {
          return (
            <ReactMarkdown key={`${messageId}-md-${index}`} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {part}
            </ReactMarkdown>
          );
        }

        const markerIndex = Number(match[1]);
        const citation = findCitationByMarker(citations, markerIndex);
        return (
          <button
            aria-label={`引用 ${markerIndex}`}
            className="answer-marker"
            disabled={!citation}
            key={`${messageId}-citation-${index}`}
            type="button"
            onClick={() => {
              if (citation) onSelectCitation(citation);
            }}
          >
            {part}
          </button>
        );
      })}
    </div>
  );
}
