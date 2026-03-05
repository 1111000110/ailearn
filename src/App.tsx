import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntdApp, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { setMessageApi } from './utils/messageApi';
import HomePage from './pages/Home';
import TrainingPage from './pages/Training';
import TeachingPage from './pages/Teaching';
import AuthPage from './pages/Auth';
import SettingsPage from './pages/Settings';

class ErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean; error?: Error }> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui', color: '#333' }}>
          <h3 style={{ marginBottom: 8 }}>页面发生错误</h3>
          <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', opacity: 0.8 }}>
            {this.state.error?.message || '未知错误'}
          </div>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * 桥接组件：将 AntdApp.useApp() 拿到的 message 实例注入到全局工具中，
 * 供非组件代码（api/client.ts 等）安全调用。
 */
const MessageBridge: React.FC = () => {
  const { message } = AntdApp.useApp();
  useEffect(() => { setMessageApi(message); }, [message]);
  return null;
};

const AppContent: React.FC = () => {
  const { theme: themeMode } = useTheme();

  const darkThemeTokens = {
    colorBgContainer: '#0f1a2e',
    colorBgElevated: '#0f1a2e',
    colorBgLayout: '#0c1628',
    colorBgSpotlight: '#0c1628',
    colorBorder: 'rgba(255, 255, 255, 0.10)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.08)',
    colorText: 'rgba(255, 255, 255, 0.92)',
    colorTextSecondary: 'rgba(255, 255, 255, 0.68)',
    colorTextTertiary: 'rgba(255, 255, 255, 0.45)',
    colorTextQuaternary: 'rgba(255, 255, 255, 0.25)',
    colorFillSecondary: 'rgba(255, 255, 255, 0.08)',
    colorFillTertiary: 'rgba(255, 255, 255, 0.05)',
  };

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          ...(themeMode === 'dark' ? darkThemeTokens : {}),
        },
      }}
    >
      <ErrorBoundary>
        <AntdApp>
          <MessageBridge />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/training/:subjectId" element={<TrainingPage />} />
              <Route path="/training/post/:postId" element={<TrainingPage />} />
              <Route path="/teaching/:catalogueId" element={<TeachingPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AntdApp>
      </ErrorBoundary>
    </ConfigProvider>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
