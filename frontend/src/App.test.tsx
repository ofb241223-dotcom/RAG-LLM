import { render, screen, within } from '@testing-library/react';
import App from './App';

describe('App shell', () => {
  it('renders the high-fidelity dashboard navigation and content sections', () => {
    render(<App />);

    expect(screen.getByRole('img', { name: 'RAG 智能文档问答 logo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /文档工作台/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('通知')).not.toBeInTheDocument();

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(within(navigation).getByText('文档中心')).toBeInTheDocument();
    expect(within(navigation).getByText('上传文档')).toBeInTheDocument();
    expect(within(navigation).getByText('文档问答')).toBeInTheDocument();

    expect(screen.getAllByTestId('stat-icon')).toHaveLength(4);
    expect(screen.getByText('向量总数')).toBeInTheDocument();
    expect(screen.getByText('1,245')).toBeInTheDocument();
    expect(screen.getByText('当前索引')).toBeInTheDocument();
    expect(screen.queryByText('存储使用量')).not.toBeInTheDocument();
    expect(screen.getByText('↑ 12.5%')).toHaveClass('trend-value');
    expect(screen.getByText('↑ 18.3%')).toHaveClass('trend-value');
    expect(screen.getByText('PDF / TXT / Word')).toBeInTheDocument();

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
    expect(screen.getByText('最近动态')).toBeInTheDocument();
  });
});
