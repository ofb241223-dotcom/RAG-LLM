import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
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

function normalizeStandaloneCitationLines(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const normalizedLines: string[] = [];
  let inFencedCodeBlock = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/u.test(line)) {
      inFencedCodeBlock = !inFencedCodeBlock;
      normalizedLines.push(line);
      continue;
    }

    if (!inFencedCodeBlock && /^(\[\d+\]\s*)+$/u.test(line.trim())) {
      while (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1].trim() === '') {
        normalizedLines.pop();
      }

      if (normalizedLines.length > 0) {
        const previousIndex = normalizedLines.length - 1;
        normalizedLines[previousIndex] = `${normalizedLines[previousIndex].replace(/\s+$/u, '')} ${line.trim()}`;
        continue;
      }
    }

    normalizedLines.push(line);
  }

  return normalizedLines.join('\n');
}

function normalizeMathDelimiters(content: string): string {
  const chunks: Array<{ code: boolean; lines: string[] }> = [];
  let inFencedCodeBlock = false;

  const pushLine = (code: boolean, line: string) => {
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk && lastChunk.code === code) {
      lastChunk.lines.push(line);
      return;
    }
    chunks.push({ code, lines: [line] });
  };

  const normalizeTextMath = (text: string): string => text
    .replace(/\\+\[([\s\S]+?)\\+\]/gu, (_match, formula: string) => `\n\n$$\n${formula.trim()}\n$$\n\n`)
    .replace(/\\+\(([\s\S]+?)\\+\)/gu, (_match, formula: string) => `$${formula.trim()}$`);

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (/^\s*(```|~~~)/u.test(line)) {
      pushLine(true, line);
      inFencedCodeBlock = !inFencedCodeBlock;
      continue;
    }

    pushLine(inFencedCodeBlock, line);
  }

  return chunks
    .map((chunk) => (chunk.code ? chunk.lines.join('\n') : normalizeTextMath(chunk.lines.join('\n'))))
    .join('\n');
}

function linkCitationMarkers(content: string): string {
  return content.replace(/\[(\d+)\](?!\()/gu, (_marker, markerIndex: string) => `[\\[${markerIndex}\\]](#citation-${markerIndex})`);
}

export function AnswerContent({ content, citations, messageId, onSelectCitation }: AnswerContentProps) {
  const normalizedContent = normalizeMathDelimiters(normalizeStandaloneCitationLines(content));
  const hasInlineMarkers = /\[\d+\]/u.test(normalizedContent);
  const markdownContent = linkCitationMarkers(normalizedContent);

  return (
    <div className="answer-content markdown-body" data-testid={`assistant-answer-${messageId}`}>
      <ReactMarkdown
        components={{
          a({ href, children }) {
            const match = href?.match(/^#citation-(\d+)$/u);
            if (!match) {
              return <a href={href}>{children}</a>;
            }

            const markerIndex = Number(match[1]);
            const citation = findCitationByMarker(citations, markerIndex);
            return (
              <button
                aria-label={`引用 ${markerIndex}`}
                className="answer-marker"
                disabled={!citation}
                type="button"
                onClick={() => {
                  if (citation) onSelectCitation(citation);
                }}
              >
                [{markerIndex}]
              </button>
            );
          },
        }}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
      >
        {markdownContent}
      </ReactMarkdown>
      {!hasInlineMarkers && citations.length > 0 ? (
        <div className="answer-citation-fallback" aria-label="回答引用来源">
          <span>引用来源</span>
          {citations.map((citation, index) => (
            <button
              aria-label={`引用 ${index + 1}`}
              className="answer-marker"
              key={citation.key}
              type="button"
              onClick={() => onSelectCitation(citation)}
            >
              [{index + 1}]
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
