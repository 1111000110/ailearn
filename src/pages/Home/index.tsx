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
  RightOutlined,
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
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#e8e8e8'}`,
          background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.8)',
          backdropFilter: 'blur(8px)',
          flexShrink: 0,
        }}
      >
        {/* 左侧 Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 12, height: 12, borderRadius: 999,
              background: 'radial-gradient(circle at 30% 30%, #fff, #6ee7ff)',
              boxShadow: '0 0 18px rgba(110,231,255,0.35)',
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 16, color: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a', letterSpacing: 0.2 }}>
            码力学社
          </span>
          <span
            style={{
              fontSize: 12, padding: '2px 8px', borderRadius: 999,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#d9d9d9'}`,
              color: isDark ? 'rgba(255,255,255,0.5)' : '#999',
            }}
          >
            Beta
          </span>
        </div>

        {/* 右侧操作 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {user ? (
            <Dropdown
              menu={{
                items: [
                  { key: 'settings', label: '个人设置', onClick: () => navigate('/settings') },
                  { key: 'logout', label: '退出登录', danger: true, onClick: logout },
                ],
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Avatar size={28} src={user.avatar} />
                <span style={{ color: isDark ? 'rgba(255,255,255,0.85)' : '#333' }}>
                  {user.nickName || '用户'}
                </span>
              </div>
            </Dropdown>
          ) : (
            <Button type="primary" onClick={() => navigate('/auth')}>登录</Button>
          )}
          <Tooltip title={isDark ? '切换到亮色模式' : '切换到暗色模式'}>
            <Button
              type="text"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              style={{ color: isDark ? 'rgba(255,255,255,0.68)' : '#666' }}
            />
          </Tooltip>
        </div>
      </header>

      {/* ===== 主内容 ===== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px 60px' }}>
        {/* Hero 标题区 */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Title level={1} style={{ margin: 0, fontSize: 36, color: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a', fontWeight: 800 }}>
            码力学，码上会
          </Title>
          <Paragraph style={{ marginTop: 12, fontSize: 16, color: isDark ? 'rgba(255,255,255,0.55)' : '#888', maxWidth: 560 }}>
            AI 驱动的编程学习平台 —— 系统教学掌握知识体系，实战训练巩固编程能力
          </Paragraph>
        </div>

        {/* ==================== 教学模块区 ==================== */}
        <div style={{ width: '100%', maxWidth: 1060, marginBottom: 56 }}>
          {/* 区域标题 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: isDark ? 'rgba(22,119,255,0.15)' : 'rgba(22,119,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <BookOutlined style={{ fontSize: 16, color: '#1677ff' }} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a' }}>
                  教学模块
                </div>
                <div style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.45)' : '#999', marginTop: 1 }}>
                  AI 生成的系统化课程，章节式教学
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Tooltip title="刷新列表">
                <Button size="small" icon={<ReloadOutlined />} onClick={loadModules} loading={loading} />
              </Tooltip>
              {user && (
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  创建模块
                </Button>
              )}
            </div>
          </div>

          {/* 模块卡片 */}
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
              <div style={{ marginTop: 16, color: isDark ? 'rgba(255,255,255,0.55)' : '#888' }}>加载中...</div>
            </div>
          ) : modules.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 20px',
              borderRadius: 16,
              border: `1px dashed ${isDark ? 'rgba(255,255,255,0.12)' : '#d9d9d9'}`,
              background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.5)',
              color: isDark ? 'rgba(255,255,255,0.45)' : '#999',
            }}>
              <BookOutlined style={{ fontSize: 40, marginBottom: 14, opacity: 0.3 }} />
              <div style={{ fontSize: 15, marginBottom: 6 }}>暂无学习模块</div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                {user ? '点击「创建模块」开始构建你的第一个学习模块' : '登录后可以创建学习模块'}
              </div>
              {!user && <Button type="primary" size="small" onClick={() => navigate('/auth')}>去登录</Button>}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
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
                      padding: 18,
                      borderRadius: 14,
                      cursor: 'pointer',
                      border: `1px solid ${
                        isHovered
                          ? isDark ? 'rgba(110,231,255,0.3)' : color
                          : isDark ? 'rgba(255,255,255,0.10)' : '#e8e8e8'
                      }`,
                      background: isDark
                        ? isHovered ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'
                        : isHovered ? '#fff' : 'rgba(255,255,255,0.7)',
                      transition: 'all 0.2s ease',
                      transform: isHovered ? 'translateY(-2px)' : 'none',
                      boxShadow: isHovered
                        ? isDark ? '0 8px 24px rgba(0,0,0,0.3)' : '0 8px 24px rgba(0,0,0,0.08)'
                        : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8,
                          background: `${color}18`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, fontWeight: 700, color,
                        }}>
                          {cat.title.charAt(0)}
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 700, color: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a' }}>
                          {cat.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {chapterCount > 0 && (
                          <span style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.35)' : '#bbb' }}>
                            {chapterCount} 章
                          </span>
                        )}
                        <RightOutlined style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.25)' : '#ccc', opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s' }} />
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: isDark ? 'rgba(255,255,255,0.50)' : '#888' }}>
                      {cat.desc || '暂无描述'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================== 训练模式区 ==================== */}
        <div style={{ width: '100%', maxWidth: 1060 }}>
          {/* 区域标题 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: isDark ? 'rgba(250,173,20,0.15)' : 'rgba(250,173,20,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ThunderboltOutlined style={{ fontSize: 16, color: '#faad14' }} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a' }}>
                编程训练
              </div>
              <div style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.45)' : '#999', marginTop: 1 }}>
                AI 出题 + AI 评判，选择科目开始刷题
              </div>
            </div>
          </div>

          {/* 科目卡片网格 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
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
                    padding: '14px 16px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    border: `1px solid ${
                      isHovered
                        ? isDark ? `${sub.color}66` : sub.color
                        : isDark ? 'rgba(255,255,255,0.08)' : '#e8e8e8'
                    }`,
                    background: isDark
                      ? isHovered ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'
                      : isHovered ? '#fff' : 'rgba(255,255,255,0.6)',
                    transition: 'all 0.2s ease',
                    transform: isHovered ? 'translateY(-2px)' : 'none',
                    boxShadow: isHovered
                      ? isDark ? '0 6px 20px rgba(0,0,0,0.25)' : '0 6px 20px rgba(0,0,0,0.06)'
                      : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: `${sub.color}14`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20,
                  }}>
                    {sub.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 650,
                      color: isDark ? 'rgba(255,255,255,0.90)' : '#1a1a1a',
                      marginBottom: 2,
                    }}>
                      {sub.name}
                    </div>
                    <div style={{
                      fontSize: 11.5, lineHeight: 1.4,
                      color: isDark ? 'rgba(255,255,255,0.40)' : '#999',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {sub.desc.split('，')[0]}
                    </div>
                  </div>
                  <RightOutlined style={{
                    fontSize: 11, flexShrink: 0,
                    color: isDark ? 'rgba(255,255,255,0.20)' : '#ccc',
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.2s',
                  }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== 创建模块弹窗 ===== */}
      <Modal
        title="创建学习模块"
        open={createOpen}
        onCancel={closeCreateModal}
        footer={null}
        width={560}
        destroyOnHidden
      >
        {createStep === 'input' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>模块名称 *</div>
              <Input
                placeholder="例如：Go 语言、Python 编程、数据结构与算法"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                maxLength={50}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>补充描述（可选）</div>
              <TextArea
                placeholder="描述这个模块的学习目标、适合人群等，AI 会参考此信息生成大纲"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={closeCreateModal}>取消</Button>
              <Button type="primary" onClick={handleCreate} disabled={!newTitle.trim()}>
                AI 生成并创建
              </Button>
            </div>
          </div>
        )}

        {createStep === 'generating' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Spin size="small" />
              <span>AI 正在为「{newTitle}」生成课程大纲...</span>
            </div>
            {generateProgress && (
              <div
                style={{
                  fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  lineHeight: 1.5, maxHeight: 300, overflow: 'auto',
                  padding: 12, borderRadius: 8,
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
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} />} />
            <div style={{ marginTop: 12 }}>正在创建目录结构...</div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default HomePage;
