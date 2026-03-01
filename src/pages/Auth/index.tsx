import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Tabs, Segmented, Tooltip, Typography, App as AntdApp } from 'antd';
import { ArrowLeftOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { loginUser, registerUser } from '../../api/user';

const { Title } = Typography;

// ==================== 主题色变量 ====================
// 与 Training / Teaching 页保持一致的 hook 模式，
// 只提供页面级布局所需的颜色值；
// Ant Design 组件（Input、Tabs 等）不做额外样式覆盖，
// 完全由 ConfigProvider + darkAlgorithm 控制。
const useThemeColors = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return {
    isDark,
    toggleTheme,
    // 页面级背景
    pageBg: isDark
      ? 'radial-gradient(1200px 600px at 30% 10%,rgba(110,231,255,.06),transparent 55%),' +
        'radial-gradient(900px 500px at 80% 30%,rgba(34,197,94,.04),transparent 55%),#0b1220'
      : 'linear-gradient(135deg,#f5f7fa 0%,#e4e9f0 100%)',
    // 卡片/面板
    card: isDark ? '#0f1a2e' : '#fff',
    // 分割线/边框
    stroke: isDark ? 'rgba(255,255,255,0.10)' : '#e8e8e8',
    // 头部栏背景
    headerBg: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.8)',
    // 文字色阶
    text: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a',
    muted: isDark ? 'rgba(255,255,255,0.68)' : '#666',
    tertiary: isDark ? 'rgba(255,255,255,0.45)' : '#999',
  };
};

// ==================== 登录 / 注册页面 ====================
const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const c = useThemeColors();
  const { refresh } = useAuth();
  const { message } = AntdApp.useApp();

  const [loading, setLoading] = useState(false);
  // 登录方式：手机号 / 用户 ID
  const [loginMethod, setLoginMethod] = useState<'phone' | 'userId'>('phone');
  const [loginForm] = Form.useForm();

  // ---------- 登录 ----------
  const onLogin = async (values: { phone?: string; user_id?: string; password: string }) => {
    setLoading(true);
    try {
      const payload =
        loginMethod === 'phone'
          ? { phone: values.phone || '', user_id: "0", password: values.password }
          : { phone: '', user_id: values.user_id || "0", password: values.password };
      const resp = await loginUser(payload);
      localStorage.setItem('token', resp.token);
      message.success('登录成功');
      await refresh();
      navigate('/');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // ---------- 注册 ----------
  const onRegister = async (values: { phone: string; password: string }) => {
    setLoading(true);
    try {
      const resp = await registerUser({ ...values, role: 'user' });
      localStorage.setItem('token', resp.token);
      message.success('注册成功，已自动登录');
      await refresh();
      navigate('/');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  // ==================== JSX ====================
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 24,
        background: c.pageBg,
      }}
    >
      {/* ===== 顶部导航栏 ===== */}
      <header
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderRadius: 8,
          border: `1px solid ${c.stroke}`,
          background: c.headerBg,
          backdropFilter: 'blur(8px)',
          marginBottom: 24,
        }}
      >
        {/* 左侧：返回 + Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tooltip title="返回首页">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/')}
              style={{ color: c.muted }}
            />
          </Tooltip>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: 'radial-gradient(circle at 30% 30%,#fff,#6ee7ff)',
              boxShadow: '0 0 18px rgba(110,231,255,.35)',
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 16, color: c.text, letterSpacing: 0.2 }}>
            码力学社
          </span>
        </div>

        {/* 右侧：主题切换 */}
        <Tooltip title={c.isDark ? '切换到亮色模式' : '切换到暗色模式'}>
          <Button
            type="text"
            icon={c.isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={c.toggleTheme}
            style={{ color: c.muted }}
          />
        </Tooltip>
      </header>

      {/* ===== 卡片居中 ===== */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: 420,
            borderRadius: 12,
            padding: '24px 28px',
            background: c.card,
            border: `1px solid ${c.stroke}`,
          }}
        >
          {/* 标题 */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <Title level={3} style={{ margin: 0, color: c.text }}>
              注册 / 登录
            </Title>
          </div>

          {/* 登录 / 注册切换 Tabs —— 不传额外 style，由 ConfigProvider 主题控制 */}
          <Tabs
            defaultActiveKey="login"
            centered
            items={[
              {
                key: 'login',
                label: '登录',
                children: (
                  <div>
                    {/* 登录方式切换 */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      <Segmented
                        value={loginMethod}
                        onChange={(v) => {
                          setLoginMethod(v as 'phone' | 'userId');
                          loginForm.resetFields();
                        }}
                        options={[
                          { label: '手机号登录', value: 'phone' },
                          { label: '用户ID登录', value: 'userId' },
                        ]}
                      />
                    </div>

                    {/* 登录表单 */}
                    <Form form={loginForm} layout="vertical" onFinish={onLogin}>
                      {loginMethod === 'phone' ? (
                        <Form.Item
                          label="手机号"
                          name="phone"
                          rules={[{ required: true, message: '请输入手机号' }]}
                        >
                          <Input placeholder="请输入手机号" />
                        </Form.Item>
                      ) : (
                        <Form.Item
                          label="用户ID"
                          name="user_id"
                          rules={[{ required: true, message: '请输入用户ID' }]}
                        >
                          <Input placeholder="请输入用户ID" />
                        </Form.Item>
                      )}
                      <Form.Item
                        label="密码"
                        name="password"
                        rules={[{ required: true, message: '请输入密码' }]}
                      >
                        <Input.Password placeholder="请输入密码" />
                      </Form.Item>
                      <Form.Item>
                        <Button type="primary" htmlType="submit" block loading={loading}>
                          登录
                        </Button>
                      </Form.Item>
                    </Form>
                  </div>
                ),
              },
              {
                key: 'register',
                label: '注册',
                children: (
                  <Form layout="vertical" onFinish={onRegister}>
                    <Form.Item
                      label="手机号"
                      name="phone"
                      rules={[{ required: true, message: '请输入手机号' }]}
                    >
                      <Input placeholder="请输入手机号" />
                    </Form.Item>
                    <Form.Item
                      label="密码"
                      name="password"
                      rules={[{ required: true, message: '请设置登录密码' }]}
                    >
                      <Input.Password placeholder="请设置登录密码" />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit" block loading={loading}>
                        注册并登录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />

          {/* 底部快捷返回 */}
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Button
              type="link"
              onClick={() => navigate('/')}
              style={{ color: c.tertiary, fontSize: 13 }}
            >
              暂不登录，返回首页
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
