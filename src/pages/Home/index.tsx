/**
 * 首页 —— 展示所有学习模块（根目录）
 *
 * 数据来源：后端 /api/catalogue/root/list
 * 登录用户可创建新模块：输入名称描述 → AI 生成大纲 → 后端创建目录
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Tooltip, Avatar, Dropdown, Modal, Input, Spin, App as AntdApp } from 'antd';
import {
  SunOutlined,
  MoonOutlined,
  BookOutlined,
  PlusOutlined,
  ReloadOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  WechatOutlined,
  MailOutlined,
  FileTextOutlined,
  SafetyOutlined,
  ArrowRightOutlined,
  CodeOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getCatalogueRootList } from '../../api/catalogue';
import { createCatalogue } from '../../api/catalogue';
import { runAgentStream } from '../../api/agent';
import { AGENT_CONFIG } from '../../config/agents';
import { subjects } from '../../config/subjects';
import type { CatalogueStruct, CatalogueCreateStruct } from '../../api/catalogue';
import type { RunAgentStreamResp } from '../../types/agent';
import type { StreamClient } from '../../api/agent';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

// ==================== 工具函数 ====================

/** 根据字符串生成一个稳定的主题色（用于模块卡片） */
const CARD_COLORS = [
  '#1677ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1',
  '#13c2c2', '#2f54eb', '#fa541c', '#a0d911', '#1890ff',
];
function getCardColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return CARD_COLORS[Math.abs(hash) % CARD_COLORS.length];
}

/** 从 AI 返回的文本中提取 JSON（兼容 ```json 包裹和裸 JSON） */
function extractJSON(text: string): string | null {
  const trimmed = text.trim();
  // 尝试直接解析
  try { const p = JSON.parse(trimmed); return JSON.stringify(p); } catch { /* */ }
  // 尝试 ```json ... ``` 块
  const blockMatch = trimmed.match(/```json\s*\n([\s\S]*?)```/);
  if (blockMatch) {
    try { const p = JSON.parse(blockMatch[1].trim()); return JSON.stringify(p); } catch { /* */ }
  }
  // 尝试找第一个完整 JSON 对象
  const startIdx = trimmed.indexOf('{');
  if (startIdx !== -1) {
    let depth = 0, inStr = false, esc = false;
    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { const p = JSON.parse(trimmed.slice(startIdx, i + 1)); return JSON.stringify(p); } catch { /* */ }
        }
      }
    }
  }
  return null;
}

// ==================== 主组件 ====================

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const { user, logout } = useAuth();
  const { message } = AntdApp.useApp();

  // ---- 模块列表 ----
  const [modules, setModules] = useState<CatalogueStruct[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // ---- 创建模块弹窗 ----
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createStep, setCreateStep] = useState<'input' | 'generating' | 'creating'>('input');
  const [generateProgress, setGenerateProgress] = useState('');
  const streamRef = useRef<StreamClient | null>(null);

  /** 加载根目录列表 */
  const loadModules = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getCatalogueRootList({ offset: 0, limit: 200 });
      setModules(resp.catalogue_struct_list || []);
    } catch {
      // client 拦截器已处理错误提示
    } finally {
      setLoading(false);
    }
  }, []);

  // 页面挂载时加载
  useEffect(() => { loadModules(); }, [loadModules]);

  // 组件卸载时关闭可能还在运行的 AI 流
  useEffect(() => () => { streamRef.current?.close(); }, []);

  /** 关闭创建弹窗并重置状态 */
  const closeCreateModal = () => {
    streamRef.current?.close();
    streamRef.current = null;
    setCreateOpen(false);
    setNewTitle('');
    setNewDesc('');
    setCreateStep('input');
    setGenerateProgress('');
  };

  /**
   * 创建模块完整流程：
   * 1. AI 流式生成课程大纲 JSON
   * 2. 解析为 CatalogueCreateStruct
   * 3. 调用后端创建接口
   */
  const handleCreate = () => {
    if (!newTitle.trim()) { message.warning('请输入模块名称'); return; }

    setCreateStep('generating');
    setGenerateProgress('');

    // AI Prompt：要求返回 JSON 格式的课程大纲
    const prompt = `请为「${newTitle.trim()}」生成专业的教学大纲。${newDesc ? `补充描述为：${newDesc}` : ''}`;

    const { agent_id, api_key } = AGENT_CONFIG.outlineGenerator;
    let accumulated = '';

    // 构建流式请求
    const sessionId = `create_module_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    streamRef.current?.close();
    const client = runAgentStream({
      agent_id,
      api_key,
      agent_message: {
        agent_id,
        agent_session_id: sessionId,
        message_agent_session_id: sessionId,
        role: 'user',
        message_type: 0,
        message_content: prompt,
      },
    });
    streamRef.current = client;

    // 监听流式数据
    client.addEventListener('message', (data) => {
      const parsed = data as RunAgentStreamResp;
      try {
        if (parsed.type === 'content') {
          const d = JSON.parse(parsed.data);
          accumulated += d.content;
          setGenerateProgress(accumulated);
        } else if (parsed.type === 'message_end') {
          // AI 生成完毕 → 解析 JSON → 创建目录
          client.close();
          streamRef.current = null;
          handleParseAndCreate(accumulated);
        } else if (parsed.type === 'error') {
          const d = JSON.parse(parsed.data);
          message.error(d.message || 'AI 生成失败');
          setCreateStep('input');
        }
      } catch (err) {
        console.error('Stream parse error:', err);
      }
    });

    client.addEventListener('error', () => {
      message.error('AI 连接失败');
      setCreateStep('input');
    });
  };

  /**
   * 解析 AI 生成的大纲 JSON，转换为后端要求的 CatalogueCreateStruct 并创建
   */
  const handleParseAndCreate = async (aiText: string) => {
    setCreateStep('creating');

    try {
      // 1. 提取 JSON
      const jsonStr = extractJSON(aiText);
      if (!jsonStr) throw new Error('未能从 AI 输出中提取有效 JSON');

      const data = JSON.parse(jsonStr);
      if (!data.chapters || !Array.isArray(data.chapters)) {
        throw new Error('大纲格式不正确，缺少 chapters 数组');
      }

      const userId = user?.userId || '0';

      // 2. 转换为后端 CatalogueCreateStruct（递归结构）
      const catalogueStruct: CatalogueCreateStruct = {
        user_id: userId,
        title: newTitle.trim(),
        desc: newDesc.trim() || `${newTitle.trim()} 学习模块`,
        post_id: '0',
        parent_catalogue_id: '0',
        catalogue_create_sub: data.chapters.map((chapter: { title: string; desc?: string; sections?: { title: string; desc?: string }[] }) => ({
          user_id: userId,
          title: chapter.title,
          desc: chapter.desc || '',
          post_id: '0',
          parent_catalogue_id: '0', // 服务端会自动填充
          catalogue_create_sub: (chapter.sections || []).map((section: { title: string; desc?: string }) => ({
            user_id: userId,
            title: section.title,
            desc: section.desc || '',
            post_id: '0',
            parent_catalogue_id: '0',
            catalogue_create_sub: [],
          })),
        })),
      };

      // 3. 调用后端创建目录
      await createCatalogue({ catalogue_create_struct: catalogueStruct });
      message.success('模块创建成功');
      closeCreateModal();

      // 4. 刷新列表
      loadModules();
    } catch (err) {
      console.error('Create catalogue error:', err);
      message.error(err instanceof Error ? err.message : '创建失败');
      setCreateStep('input');
    }
  };

  // ---- 训练模式 hover ----
  const [hoveredSubjectId, setHoveredSubjectId] = useState<string | null>(null);

  // ==================== JSX ====================
  return (
    <div
      style={{
        minHeight: '100vh',
        background: isDark
          ? 'radial-gradient(1200px 600px at 30% 10%, rgba(110,231,255,0.06), transparent 55%), radial-gradient(900px 500px at 80% 30%, rgba(34,197,94,0.04), transparent 55%), #0b1220'
          : 'linear-gradient(135deg, #f5f7fa 0%, #e4e9f0 100%)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {/* ===== 顶部栏 ===== */}
      <header
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#e8e8e8'}`,
          background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.8)',
          backdropFilter: 'blur(8px)',
          flexShrink: 0,
        }}
      >
        {/* 左侧 Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #1677ff 0%, #52c41a 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(22, 119, 255, 0.4)',
            }}
          >
            <CodeOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ 
              fontWeight: 700, 
              fontSize: 18, 
              color: isDark ? 'rgba(255,255,255,0.95)' : '#1a1a1a', 
              letterSpacing: -0.3 
            }}>
              码力学社
            </span>
            <span
              style={{
                fontSize: 11, 
                padding: '3px 10px', 
                borderRadius: 20,
                background: isDark ? 'rgba(22, 119, 255, 0.2)' : 'rgba(22, 119, 255, 0.1)',
                color: '#1677ff',
                fontWeight: 500,
              }}
            >
              Beta
            </span>
          </div>
        </div>

        {/* 右侧操作 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user ? (
            <Dropdown
              menu={{
                items: [
                  { key: 'settings', label: '个人设置', onClick: () => navigate('/settings') },
                  { key: 'logout', label: '退出登录', danger: true, onClick: logout },
                ],
              }}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 10, 
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 8,
                transition: 'background 0.2s',
              }}>
                <Avatar size={32} src={user.avatar} style={{ border: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                <span style={{ 
                  color: isDark ? 'rgba(255,255,255,0.9)' : '#333',
                  fontWeight: 500,
                }}>
                  {user.nickName || '用户'}
                </span>
              </div>
            </Dropdown>
          ) : (
            <Button 
              type="primary" 
              size="middle"
              onClick={() => navigate('/auth')}
              style={{
                borderRadius: 8,
                height: 36,
                padding: '0 20px',
              }}
            >
              登录
            </Button>
          )}
          <Tooltip title={isDark ? '切换到亮色模式' : '切换到暗色模式'}>
            <Button
              type="text"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              style={{ 
                color: isDark ? 'rgba(255,255,255,0.7)' : '#666',
                width: 36,
                height: 36,
                borderRadius: 8,
              }}
            />
          </Tooltip>
        </div>
      </header>

      {/* ===== 主内容 ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px 60px' }}>
        {/* Hero 标题区 */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {/* 标签 */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 20,
            background: isDark ? 'rgba(22, 119, 255, 0.15)' : 'rgba(22, 119, 255, 0.08)',
            border: `1px solid ${isDark ? 'rgba(22, 119, 255, 0.3)' : 'rgba(22, 119, 255, 0.2)'}`,
            marginBottom: 24,
          }}>
            <ThunderboltOutlined style={{ color: '#1677ff', fontSize: 14 }} />
            <span style={{ 
              fontSize: 13, 
              color: isDark ? 'rgba(255,255,255,0.8)' : '#1677ff',
              fontWeight: 500,
            }}>
              AI 驱动的智能学习平台
            </span>
          </div>
          
          {/* 主标题 */}
          <Title level={1} style={{ 
            margin: 0, 
            fontSize: 48, 
            fontWeight: 800,
            letterSpacing: -1.5,
            lineHeight: 1.1,
            marginBottom: 20,
          }}>
            <span style={{ color: isDark ? 'rgba(255,255,255,0.95)' : '#1a1a1a' }}>码力学，</span>
            <span style={{
              background: 'linear-gradient(135deg, #1677ff 0%, #52c41a 50%, #faad14 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>码上会</span>
          </Title>
          
          {/* 副标题 */}
          <Paragraph style={{ 
            margin: 0, 
            fontSize: 18, 
            lineHeight: 1.7,
            color: isDark ? 'rgba(255,255,255,0.55)' : '#666',
            maxWidth: 560,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            系统化教学掌握知识体系，AI 实战训练巩固编程能力
            <br />
            让每一次学习都高效且有针对性
          </Paragraph>
          
          {/* CTA 按钮 */}
          <div style={{ 
            display: 'flex', 
            gap: 16, 
            justifyContent: 'center',
            marginTop: 32,
          }}>
            <Button
              type="primary"
              size="large"
              icon={<RocketOutlined />}
              onClick={() => {
                const el = document.getElementById('teaching-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                height: 48,
                padding: '0 28px',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
                border: 'none',
                boxShadow: '0 4px 14px rgba(22, 119, 255, 0.4)',
              }}
            >
              开始学习
            </Button>
            <Button
              size="large"
              icon={<ThunderboltOutlined />}
              onClick={() => {
                const el = document.getElementById('training-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                height: 48,
                padding: '0 28px',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 600,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#d9d9d9'}`,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)',
                color: isDark ? 'rgba(255,255,255,0.9)' : '#333',
              }}
            >
              编程训练
            </Button>
          </div>
        </div>

        {/* 统计数据展示 */}
        <div style={{
          display: 'flex',
          gap: 48,
          marginBottom: 64,
          padding: '24px 48px',
          borderRadius: 16,
          background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.6)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          backdropFilter: 'blur(10px)',
        }}>
          {[
            { value: '10+', label: '编程科目' },
            { value: '1000+', label: 'AI 题目' },
            { value: '∞', label: '学习模块' },
          ].map((stat, index) => (
            <div key={index} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 28,
                fontWeight: 700,
                color: isDark ? 'rgba(255,255,255,0.95)' : '#1a1a1a',
                lineHeight: 1,
              }}>{stat.value}</div>
              <div style={{
                fontSize: 13,
                color: isDark ? 'rgba(255,255,255,0.5)' : '#888',
                marginTop: 6,
              }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ==================== 教学模块区 ==================== */}
        <div id="teaching-section" style={{ width: '100%', maxWidth: 1060, marginBottom: 72 }}>
          {/* 区域标题 */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'flex-end', 
            justifyContent: 'space-between', 
            marginBottom: 28,
          }}>
            <div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12,
                marginBottom: 8,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(22, 119, 255, 0.3)',
                }}>
                  <BookOutlined style={{ fontSize: 18, color: '#fff' }} />
                </div>
                <div>
                  <div style={{ 
                    fontSize: 22, 
                    fontWeight: 700, 
                    color: isDark ? 'rgba(255,255,255,0.95)' : '#1a1a1a',
                    letterSpacing: -0.3,
                  }}>
                    教学模块
                  </div>
                  <div style={{ 
                    fontSize: 14, 
                    color: isDark ? 'rgba(255,255,255,0.5)' : '#888',
                    marginTop: 2,
                  }}>
                    AI 生成的系统化课程，章节式渐进学习
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Tooltip title="刷新列表">
                <Button 
                  size="middle" 
                  icon={<ReloadOutlined />} 
                  onClick={loadModules} 
                  loading={loading}
                  style={{
                    borderRadius: 8,
                    width: 36,
                    height: 36,
                  }}
                />
              </Tooltip>
              {user && (
                <Button 
                  type="primary" 
                  size="middle" 
                  icon={<PlusOutlined />} 
                  onClick={() => setCreateOpen(true)}
                  style={{
                    borderRadius: 8,
                    height: 36,
                    padding: '0 16px',
                  }}
                >
                  创建模块
                </Button>
              )}
            </div>
          </div>

          {/* 模块卡片 */}
          {loading ? (
            <div style={{ padding: 80, textAlign: 'center' }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} />} />
              <div style={{ marginTop: 20, color: isDark ? 'rgba(255,255,255,0.55)' : '#888', fontSize: 15 }}>加载中...</div>
            </div>
          ) : modules.length === 0 ? (
            <div style={{
              textAlign: 'center', 
              padding: '64px 32px',
              borderRadius: 20,
              border: `1px dashed ${isDark ? 'rgba(255,255,255,0.15)' : '#d9d9d9'}`,
              background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.5)',
              color: isDark ? 'rgba(255,255,255,0.5)' : '#999',
            }}>
              <div style={{
                width: 80,
                height: 80,
                borderRadius: 20,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <BookOutlined style={{ fontSize: 36, opacity: 0.4 }} />
              </div>
              <div style={{ fontSize: 17, marginBottom: 8, fontWeight: 500, color: isDark ? 'rgba(255,255,255,0.7)' : '#666' }}>
                暂无学习模块
              </div>
              <div style={{ fontSize: 14, marginBottom: 20, color: isDark ? 'rgba(255,255,255,0.45)' : '#999' }}>
                {user ? '点击「创建模块」开始构建你的第一个学习模块' : '登录后可以创建学习模块'}
              </div>
              {!user && (
                <Button 
                  type="primary" 
                  size="middle" 
                  onClick={() => navigate('/auth')}
                  style={{ borderRadius: 8 }}
                >
                  去登录
                </Button>
              )}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}>
              {modules.map((mod) => {
                const cat = mod.catalogue;
                if (!cat) return null;
                const isHovered = hoveredId === cat.catalogue_id;
                const color = getCardColor(cat.title);
                const chapterCount = mod.catalogue_struct?.length || 0;

                return (
                  <div
                    key={cat.catalogue_id}
                    onMouseEnter={() => setHoveredId(cat.catalogue_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => navigate(`/teaching/${cat.catalogue_id}`)}
                    style={{
                      padding: 24,
                      borderRadius: 16,
                      cursor: 'pointer',
                      border: `1px solid ${
                        isHovered
                          ? isDark ? `${color}50` : color
                          : isDark ? 'rgba(255,255,255,0.10)' : '#e8e8e8'
                      }`,
                      background: isDark
                        ? isHovered ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'
                        : isHovered ? '#fff' : 'rgba(255,255,255,0.7)',
                      transition: 'all 0.2s ease',
                      transform: isHovered ? 'translateY(-4px)' : 'none',
                      boxShadow: isHovered
                        ? isDark ? `0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px ${color}30` : `0 12px 32px rgba(0,0,0,0.1), 0 0 0 1px ${color}20`
                        : isDark ? '0 4px 12px rgba(0,0,0,0.2)' : '0 4px 12px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12,
                          background: `${color}15`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 20, fontWeight: 700, color,
                          flexShrink: 0,
                        }}>
                          {cat.title.charAt(0)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ 
                            fontSize: 16, 
                            fontWeight: 600, 
                            color: isDark ? 'rgba(255,255,255,0.95)' : '#1a1a1a',
                            marginBottom: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {cat.title}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {chapterCount > 0 && (
                              <span style={{ 
                                fontSize: 12, 
                                color: isDark ? 'rgba(255,255,255,0.4)' : '#999',
                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                padding: '2px 8px',
                                borderRadius: 4,
                              }}>
                                {chapterCount} 章节
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: isHovered ? `${color}15` : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}>
                        <ArrowRightOutlined style={{ 
                          fontSize: 12, 
                          color: isHovered ? color : (isDark ? 'rgba(255,255,255,0.3)' : '#ccc'),
                          transform: isHovered ? 'translateX(2px)' : 'none',
                          transition: 'all 0.2s',
                        }} />
                      </div>
                    </div>
                    <p style={{ 
                      margin: 0, 
                      fontSize: 14, 
                      lineHeight: 1.6, 
                      color: isDark ? 'rgba(255,255,255,0.55)' : '#666',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {cat.desc || '暂无描述'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================== 训练模式区 ==================== */}
        <div id="training-section" style={{ width: '100%', maxWidth: 1060, marginBottom: 80 }}>
          {/* 区域标题 */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12,
              marginBottom: 8,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'linear-gradient(135deg, #faad14 0%, #d48806 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(250, 173, 20, 0.3)',
              }}>
                <ThunderboltOutlined style={{ fontSize: 18, color: '#fff' }} />
              </div>
              <div>
                <div style={{ 
                  fontSize: 22, 
                  fontWeight: 700, 
                  color: isDark ? 'rgba(255,255,255,0.95)' : '#1a1a1a',
                  letterSpacing: -0.3,
                }}>
                  编程训练
                </div>
                <div style={{ 
                  fontSize: 14, 
                  color: isDark ? 'rgba(255,255,255,0.5)' : '#888',
                  marginTop: 2,
                }}>
                  AI 出题 + AI 评判，选择科目开始刷题
                </div>
              </div>
            </div>
          </div>

          {/* 科目卡片网格 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}>
            {subjects.map((sub) => {
              const isHovered = hoveredSubjectId === sub.id;
              return (
                <div
                  key={sub.id}
                  onMouseEnter={() => setHoveredSubjectId(sub.id)}
                  onMouseLeave={() => setHoveredSubjectId(null)}
                  onClick={() => navigate(`/training/${sub.id}`)}
                  style={{
                    padding: 20,
                    borderRadius: 14,
                    cursor: 'pointer',
                    border: `1px solid ${
                      isHovered
                        ? isDark ? `${sub.color}60` : sub.color
                        : isDark ? 'rgba(255,255,255,0.08)' : '#e8e8e8'
                    }`,
                    background: isDark
                      ? isHovered ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'
                      : isHovered ? '#fff' : 'rgba(255,255,255,0.6)',
                    transition: 'all 0.2s ease',
                    transform: isHovered ? 'translateY(-4px)' : 'none',
                    boxShadow: isHovered
                      ? isDark ? `0 12px 28px rgba(0,0,0,0.35), 0 0 0 1px ${sub.color}30` : `0 12px 28px rgba(0,0,0,0.08), 0 0 0 1px ${sub.color}20`
                      : isDark ? '0 4px 12px rgba(0,0,0,0.2)' : '0 4px 12px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: `${sub.color}14`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22,
                      transition: 'all 0.2s',
                      transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                    }}>
                      {sub.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 15, fontWeight: 600,
                        color: isDark ? 'rgba(255,255,255,0.95)' : '#1a1a1a',
                        marginBottom: 4,
                      }}>
                        {sub.name}
                      </div>
                      <div style={{
                        fontSize: 12, lineHeight: 1.4,
                        color: isDark ? 'rgba(255,255,255,0.45)' : '#999',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {sub.desc.split('，')[0]}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== 底部联系我们区域 ===== */}
      <footer style={{
        background: isDark 
          ? 'linear-gradient(180deg, rgba(11,18,32,0) 0%, rgba(11,18,32,1) 100%)'
          : 'linear-gradient(180deg, rgba(245,247,250,0) 0%, rgba(228,233,240,1) 100%)',
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        padding: '60px 32px 40px',
      }}>
        <div style={{
          maxWidth: 1060,
          margin: '0 auto',
        }}>
          {/* 主要内容区 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 40,
            marginBottom: 48,
          }}>
            {/* 品牌介绍 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'linear-gradient(135deg, #1677ff 0%, #52c41a 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <CodeOutlined style={{ fontSize: 16, color: '#fff' }} />
                </div>
                <span style={{ 
                  fontWeight: 700, 
                  fontSize: 18, 
                  color: isDark ? 'rgba(255,255,255,0.95)' : '#1a1a1a', 
                }}>
                  码力学社
                </span>
              </div>
              <p style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: isDark ? 'rgba(255,255,255,0.55)' : '#666',
                margin: 0,
              }}>
                AI 驱动的编程学习平台，致力于让每个人都能高效、系统地掌握编程技能。
              </p>
            </div>

            {/* 快速链接 */}
            <div>
              <h4 style={{
                fontSize: 14,
                fontWeight: 600,
                color: isDark ? 'rgba(255,255,255,0.9)' : '#333',
                marginBottom: 16,
              }}>快速链接</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <a href="#teaching-section" style={{
                  fontSize: 14,
                  color: isDark ? 'rgba(255,255,255,0.55)' : '#666',
                  textDecoration: 'none',
                }}>教学模块</a>
                <a href="#training-section" style={{
                  fontSize: 14,
                  color: isDark ? 'rgba(255,255,255,0.55)' : '#666',
                  textDecoration: 'none',
                }}>编程训练</a>
                {user && (
                  <span onClick={() => navigate('/settings')} style={{
                    fontSize: 14,
                    color: isDark ? 'rgba(255,255,255,0.55)' : '#666',
                    cursor: 'pointer',
                  }}>个人设置</span>
                )}
              </div>
            </div>

            {/* 联系我们 */}
            <div>
              <h4 style={{
                fontSize: 14,
                fontWeight: 600,
                color: isDark ? 'rgba(255,255,255,0.9)' : '#333',
                marginBottom: 16,
              }}>联系我们</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <WechatOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                  <span style={{
                    fontSize: 14,
                    color: isDark ? 'rgba(255,255,255,0.55)' : '#666',
                  }}>微信：扫码添加</span>
                </div>
                <div style={{
                  width: 120,
                  height: 120,
                  borderRadius: 12,
                  background: '#fff',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e8e8e8'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  <img
                    src="/WechatIMG.jpg"
                    alt="微信二维码"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
                <p style={{
                  fontSize: 12,
                  color: isDark ? 'rgba(255,255,255,0.4)' : '#999',
                  margin: '4px 0 0 0',
                }}>添加微信获取最新资讯</p>
              </div>
            </div>

            {/* 法律信息 */}
            <div>
              <h4 style={{
                fontSize: 14,
                fontWeight: 600,
                color: isDark ? 'rgba(255,255,255,0.9)' : '#333',
                marginBottom: 16,
              }}>法律信息</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span onClick={() => navigate('/terms')} style={{
                  fontSize: 14,
                  color: isDark ? 'rgba(255,255,255,0.55)' : '#666',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <FileTextOutlined style={{ fontSize: 14 }} />
                  用户协议
                </span>
                <span onClick={() => navigate('/privacy')} style={{
                  fontSize: 14,
                  color: isDark ? 'rgba(255,255,255,0.55)' : '#666',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <SafetyOutlined style={{ fontSize: 14 }} />
                  隐私政策
                </span>
              </div>
            </div>
          </div>

          {/* 分割线 */}
          <div style={{
            height: 1,
            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            marginBottom: 24,
          }} />

          {/* 底部版权 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div style={{
              fontSize: 13,
              color: isDark ? 'rgba(255,255,255,0.4)' : '#999',
            }}>
              © 2025 码力学社. All rights reserved.
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{
                fontSize: 13,
                color: isDark ? 'rgba(255,255,255,0.4)' : '#999',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <MailOutlined />
                contact@ailearn.dev
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* ===== 创建模块弹窗 ===== */}
      <Modal
        title="创建学习模块"
        open={createOpen}
        onCancel={closeCreateModal}
        footer={null}
        width={560}
        destroyOnClose
      >
        {createStep === 'input' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>模块名称 *</div>
              <Input
                placeholder="例如：Go 语言、Python 编程、数据结构与算法"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                maxLength={50}
                size="large"
                style={{ borderRadius: 8 }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>补充描述（可选）</div>
              <TextArea
                placeholder="描述这个模块的学习目标、适合人群等，AI 会参考此信息生成大纲"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={4}
                maxLength={500}
                style={{ borderRadius: 8 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button size="large" onClick={closeCreateModal} style={{ borderRadius: 8 }}>取消</Button>
              <Button 
                type="primary" 
                size="large" 
                onClick={handleCreate} 
                disabled={!newTitle.trim()}
                icon={<ThunderboltOutlined />}
                style={{ borderRadius: 8 }}
              >
                AI 生成并创建
              </Button>
            </div>
          </div>
        )}

        {createStep === 'generating' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Spin size="small" />
              <span style={{ fontSize: 15 }}>AI 正在为「{newTitle}」生成课程大纲...</span>
            </div>
            {generateProgress && (
              <div
                style={{
                  fontSize: 13, 
                  fontFamily: 'monospace', 
                  whiteSpace: 'pre-wrap', 
                  wordBreak: 'break-all',
                  lineHeight: 1.6, 
                  maxHeight: 320, 
                  overflow: 'auto',
                  padding: 16, 
                  borderRadius: 10,
                  background: isDark ? 'rgba(0,0,0,0.2)' : '#f5f5f5',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#e8e8e8'}`,
                }}
              >
                {generateProgress}
              </div>
            )}
          </div>
        )}

        {createStep === 'creating' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
            <div style={{ marginTop: 16, fontSize: 15 }}>正在创建目录结构...</div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default HomePage;
