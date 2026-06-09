import { render, screen, within } from '@testing-library/react';
import App from './App';

describe('App shell', () => {
  it('renders the RAG workspace navigation and supported upload formats', () => {
    render(<App />);

    expect(screen.getByRole('img', { name: 'RAG 智能文档问答 logo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /文档工作台/ })).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(within(navigation).getByText('文档中心')).toBeInTheDocument();
    expect(within(navigation).getByText('上传文档')).toBeInTheDocument();
    expect(within(navigation).getByText('文档问答')).toBeInTheDocument();
    expect(screen.getByText('PDF / TXT / Word')).toBeInTheDocument();
  });
});
