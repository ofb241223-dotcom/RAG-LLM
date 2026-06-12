import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MessageSquareMore } from 'lucide-react';
import App from './App';
import { demoStats } from './data/demo';

describe('App shell', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'backend unavailable' }),
        text: async () => JSON.stringify({ message: 'backend unavailable' }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the dashboard shell and switches feature views with local state', async () => {
    render(<App />);

    expect(screen.getByRole('img', { name: 'RAG 智能文档问答 logo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /文档工作台/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('通知')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('搜索文档、对话或关键词...')).not.toBeInTheDocument();
    expect(screen.getByText('科大人')).toBeInTheDocument();

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(within(navigation).getByText('工作台')).toBeInTheDocument();
    expect(within(navigation).getByText('文档中心')).toBeInTheDocument();
    expect(within(navigation).getByText('上传文档')).toBeInTheDocument();
    expect(within(navigation).getByText('文档问答')).toBeInTheDocument();
    expect(within(navigation).getByText('对话历史')).toBeInTheDocument();
    expect(within(navigation).getByText('系统设置')).toBeInTheDocument();

    expect(screen.getAllByTestId('stat-icon')).toHaveLength(4);
    expect(screen.getByText('向量总数')).toBeInTheDocument();
    expect(screen.getByText('1,245')).toBeInTheDocument();
    expect(screen.getByText('当前索引')).toBeInTheDocument();
    expect(screen.queryByText('存储使用量')).not.toBeInTheDocument();
    expect(screen.queryByText('较上周')).not.toBeInTheDocument();
    expect(screen.queryByText('↑ 12.5%')).not.toBeInTheDocument();
    expect(screen.queryByText('↑ 18.3%')).not.toBeInTheDocument();
    expect(screen.getByText('PDF / TXT / Word / Excel')).toBeInTheDocument();

    expect(screen.getByText('《深度学习原理与实践》第3章.pdf')).toBeInTheDocument();
    expect(screen.getByText('自然语言处理综述.docx')).toBeInTheDocument();
    expect(screen.getByText('实验记录与结果分析.txt')).toBeInTheDocument();

    const processFlow = screen.getByLabelText('RAG 检索增强生成流程');
    expect(within(processFlow).getAllByRole('listitem')).toHaveLength(5);
    expect(within(processFlow).getByText('上传文档')).toBeInTheDocument();
    expect(within(processFlow).getByText('文本解析')).toBeInTheDocument();
    expect(within(processFlow).getByText('文本分块')).toBeInTheDocument();
    expect(within(processFlow).getByText('向量化')).toBeInTheDocument();
    expect(within(processFlow).getByText('检索问答')).toBeInTheDocument();
    expect(within(processFlow).getAllByTestId('process-icon')).toHaveLength(5);

    expect(screen.getByText('快捷操作')).toBeInTheDocument();
    expect(screen.getByText('查看向量索引')).toBeInTheDocument();
    expect(screen.queryByText('查看向量库')).not.toBeInTheDocument();
    expect(screen.getByText('最近动态')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('后端暂不可用，当前显示本地占位数据。')).toBeInTheDocument();
    });

    fireEvent.click(within(navigation).getByRole('button', { name: /文档中心/ }));
    expect(screen.getByRole('heading', { name: '文档中心' })).toBeInTheDocument();

    fireEvent.click(within(navigation).getByRole('button', { name: /上传文档/ }));
    expect(screen.getByRole('heading', { name: '上传文档' })).toBeInTheDocument();
    expect(screen.getByLabelText('选择文件')).toBeInTheDocument();

    fireEvent.click(within(navigation).getByRole('button', { name: /文档问答/ }));
    expect(screen.getByRole('heading', { name: '文档问答' })).toBeInTheDocument();
    expect(screen.getByLabelText('输入文档问题')).toBeInTheDocument();

    fireEvent.click(within(navigation).getByRole('button', { name: /对话历史/ }));
    expect(screen.getByRole('heading', { name: '对话历史' })).toBeInTheDocument();
    expect(screen.getByLabelText('继续提问')).toBeInTheDocument();

    fireEvent.click(within(navigation).getByRole('button', { name: /系统设置/ }));
    await waitFor(() => {
      expect(screen.getByText('系统设置不可用。')).toBeInTheDocument();
    });
  });

  it('uses a chat-with-dots icon for the conversation total dashboard stat', () => {
    expect(demoStats.find((stat) => stat.label === '对话总数')?.icon).toBe(MessageSquareMore);
  });
});
