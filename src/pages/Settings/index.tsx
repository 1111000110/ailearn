import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Form, Input, Select, Space, Tooltip, Typography, App as AntdApp } from 'antd';
import { ArrowLeftOutlined, SunOutlined, MoonOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { updateUserInfo } from '../../api/user';

const { Title } = Typography;

// ==================== 主题色变量 ====================
// 与 Auth / Training / Teaching 页保持一致的 hook 模式，
// Ant Design 组件由 ConfigProvider + darkAlgorithm 统一控制。
const useThemeColors = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return {
    isDark,
    toggleTheme,
    pageBg: isDark
      ? 'radial-gradient(1200px 600px at 30% 10%,rgba(110,231,255,.06),transparent 55%),' +
        'radial-gradient(900px 500px at 80% 30%,rgba(34,197,94,.04),transparent 55%),#0b1220'
      : 'linear-gradient(135deg,#f5f7fa 0%,#e4e9f0 100%)',
    card: isDark ? '#0f1a2e' : '#fff',
    stroke: isDark ? 'rgba(255,255,255,0.10)' : '#e8e8e8',
    headerBg: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.8)',
    text: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a',
    muted: isDark ? 'rgba(255,255,255,0.68)' : '#666',
    tertiary: isDark ? 'rgba(255,255,255,0.45)' : '#999',
    avatarBg: isDark ? 'rgba(110,231,255,0.12)' : '#e6f4ff',
    avatarColor: isDark ? '#6ee7ff' : '#1677ff',
  };
};

// ==================== 用户信息设置页面 ====================
const SettingsPage: React.FC = () => {
  const { user, refresh } = useAuth();
  const c = useThemeColors();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();

  // 用户信息加载后填充表单
  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        nick_name: user.nickName,
        avatar: user.avatar,
        gender: user.gender,
        email: user.email,
        phone: user.phone,
      });
    }
  }, [user, form]);

  // ---------- 保存用户信息 ----------
  const onSave = async () => {
    const values = await form.validateFields();
    if (!user) return;
    try {
      await updateUserInfo({
        user_info: {
          user_base: {
            user_id: user.userId,
            nick_name: values.nick_name,
            avatar: values.avatar || '',
            gender: values.gender || 'unknown',
            birth_date: user.birthDate || 0,
          },
          user_private: {
            user_id: user.userId,
            phone: values.phone || '',
            email: values.email || '',
            role: user.role || 'user',
            status: user.status ?? 0,
          },
        },
        update_type: 'basic',
      });
      message.success('已保存');
      await refresh();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  // 头像 / 昵称实时预览
  const avatarUrl = Form.useWatch('avatar', form);
  const nickName = Form.useWatch('nick_name', form);

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
      {/* ===== 顶部导航栏（与 Auth 页完全一致） ===== */}
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
            码上学
          </span>
        </div>
        <Tooltip title={c.isDark ? '切换到亮色模式' : '切换到暗色模式'}>
          <Button
            type="text"
            icon={c.isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={c.toggleTheme}
            style={{ color: c.muted }}
          />
        </Tooltip>
      </header>

      {/* ===== 主内容区 ===== */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', paddingTop: 24 }}>
        <div
          style={{
            width: 560,
            borderRadius: 12,
            padding: '32px 32px 24px',
            background: c.card,
            border: `1px solid ${c.stroke}`,
          }}
        >
          {/* 头像 + 昵称预览 */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Avatar
              size={72}
              src={avatarUrl || undefined}
              icon={!avatarUrl ? <UserOutlined /> : undefined}
              style={{ background: c.avatarBg, color: c.avatarColor }}
            />
            <Title level={4} style={{ margin: '12px 0 0', color: c.text }}>
              {nickName || '用户'}
            </Title>
            <div style={{ color: c.tertiary, fontSize: 13 }}>
              {user ? `ID: ${user.userId}` : ''}
            </div>
          </div>

          {/* 信息表单 —— 不传额外 style，由 ConfigProvider 主题控制 */}
          <Form form={form} layout="vertical">
            <Form.Item
              label="昵称"
              name="nick_name"
              rules={[{ required: true, message: '请输入昵称' }]}
            >
              <Input placeholder="请输入昵称" />
            </Form.Item>
            <Form.Item label="头像链接" name="avatar">
              <Input placeholder="请输入头像URL" />
            </Form.Item>
            <Form.Item label="性别" name="gender">
              <Select
                options={[
                  { value: 'male', label: '男' },
                  { value: 'female', label: '女' },
                  { value: 'unknown', label: '保密' },
                ]}
              />
            </Form.Item>
            <Form.Item label="邮箱" name="email">
              <Input placeholder="请输入邮箱" />
            </Form.Item>
            <Form.Item label="手机号" name="phone">
              <Input placeholder="请输入手机号" />
            </Form.Item>

            {/* 操作按钮 */}
            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
              <Space>
                <Button type="primary" onClick={onSave}>
                  保存
                </Button>
                <Button onClick={() => navigate('/')}>返回</Button>
              </Space>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
