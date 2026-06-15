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

  it('renders model block LaTeX delimiters across multiple lines', () => {
    render(
      <AnswerContent
        content={'计算过程\n\n\\\\[\n\\\\frac{76.5 + 91.5 + 78.3}{3}\n= 82.1\n\\\\]\n\n结果来自表格 [1]。'}
        citations={[citation]}
        messageId={105}
        onSelectCitation={() => undefined}
      />,
    );

    const answer = screen.getByTestId('assistant-answer-105');
    expect(answer.textContent).not.toContain('\\[');
    expect(answer.textContent).not.toContain('\\]');
    expect(answer.querySelector('.katex')).not.toBeNull();
    expect(screen.getByRole('button', { name: '引用 1' })).toBeInTheDocument();
  });

  it('keeps standalone citation marker lines inline with the preceding list item', () => {
    const onSelectCitation = vi.fn();
    const secondCitation = { ...citation, key: '102:1:chunk-2', markerIndex: 2, chunkId: 'chunk-2' };

    render(
      <AnswerContent
        content={'- 学号：202424003\n[1]\n- 班级：软工2401\n[2]'}
        citations={[citation, secondCitation]}
        messageId={102}
        onSelectCitation={onSelectCitation}
      />,
    );

    const answer = screen.getByTestId('assistant-answer-102');
    const items = answer.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('button', { name: '引用 1' })).toBeInTheDocument();
    expect(within(items[1]).getByRole('button', { name: '引用 2' })).toBeInTheDocument();

    fireEvent.click(within(items[1]).getByRole('button', { name: '引用 2' }));
    expect(onSelectCitation).toHaveBeenCalledWith(secondCitation);
  });

  it('leaves unmatched citation markers disabled', () => {
    render(<AnswerContent content={'无匹配来源。[2]'} citations={[citation]} messageId={102} onSelectCitation={() => undefined} />);

    expect(screen.getByRole('button', { name: '引用 2' })).toBeDisabled();
    expect(within(screen.getByTestId('assistant-answer-102')).getByText('无匹配来源。')).toBeInTheDocument();
  });

  it('shows citation buttons when the model response omits inline markers', () => {
    const onSelectCitation = vi.fn();

    render(<AnswerContent content="模型回答没有内联引用编号。" citations={[citation]} messageId={102} onSelectCitation={onSelectCitation} />);

    expect(screen.getByText('引用来源')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '引用 1' }));
    expect(onSelectCitation).toHaveBeenCalledWith(citation);
  });

  it('renders table cell line breaks instead of showing raw br tags', () => {
    render(
      <AnswerContent
        content={'| 项目 | 内容 |\n| --- | --- |\n| 学术竞赛 | 1. 国家级三等奖<br>2. 省级二等奖 |'}
        citations={[]}
        messageId={103}
        onSelectCitation={() => undefined}
      />,
    );

    const answer = screen.getByTestId('assistant-answer-103');
    expect(answer.textContent).not.toContain('<br>');
    expect(answer.querySelector('table')).not.toBeNull();
    expect(answer.querySelector('td br')).not.toBeNull();
  });
});
