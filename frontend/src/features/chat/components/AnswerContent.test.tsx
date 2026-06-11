import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnswerContent } from './AnswerContent';
import { citation } from '../chatTestData';

describe('AnswerContent', () => {
  it('renders Markdown, LaTeX, and clickable citation markers', () => {
    const onSelectCitation = vi.fn();

    render(
      <AnswerContent
        content={'**多头注意力** 可以表示为 $QK^T$。[1]\n\n- 支持列表'}
        citations={[citation]}
        messageId={102}
        onSelectCitation={onSelectCitation}
      />,
    );

    expect(screen.getByText('多头注意力').tagName).toBe('STRONG');
    expect(screen.getByTestId('assistant-answer-102').querySelector('.katex')).not.toBeNull();
    expect(screen.getByTestId('assistant-answer-102').textContent).toContain('QK^T');
    expect(screen.getByText('支持列表')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '引用 1' }));
    expect(onSelectCitation).toHaveBeenCalledWith(citation);
  });

  it('leaves unmatched citation markers disabled', () => {
    render(<AnswerContent content={'无匹配来源。[2]'} citations={[citation]} messageId={102} onSelectCitation={() => undefined} />);

    expect(screen.getByRole('button', { name: '引用 2' })).toBeDisabled();
    expect(within(screen.getByTestId('assistant-answer-102')).getByText('无匹配来源。')).toBeInTheDocument();
  });
});
