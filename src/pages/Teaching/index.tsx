/**
 * 教学页面 —— 三栏布局：目录 | 教学内容 | AI 助教
 *
 * 核心数据流变更（相对旧版）：
 * - 课程大纲：从后端 /api/catalogue/detail 获取，不再每次 AI 生成
 * - 教学内容：
 *   · post_id > 0 → /api/post/detail 获取已有文章
 *   · post_id === 0 → AI 流式生成 → /api/post/create 保存 → /api/catalogue/update 绑定
 * - AI 对话：保持不变，仍走 Agent 流式接口
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Typography, Tooltip, Input, Spin, Switch, Space, message,
} from 'antd';
import {
  ArrowLeftOutlined, SunOutlined, MoonOutlined, SendOutlined,
  RobotOutlined, ClearOutlined, LoadingOutlined, BookOutlined,
  RightOutlined, CaretRightOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  UndoOutlined, LoginOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getCatalogueDetail, updateCatalogue } from '../../api/catalogue';
import { createPost, getPostDetail } from '../../api/post';
import { runAgentStream } from '../../api/agent';
import { AGENT_CONFIG } from '../../config/agents';
import CodeEditor from '../../components/CodeEditor';
import type { CatalogueStruct, CatalogueDetail } from '../../api/catalogue';
import type { StreamClient } from '../../api/agent';
import type { RunAgentStreamResp } from '../../types/agent';

const { Text } = Typography;
const { TextArea } = Input;

// ==================== 主题色 ====================
const useThemeColors = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return {
    isDark,
    bg: isDark ? '#0b1220' : '#f0f2f5',
    panel: isDark ? '#0f1a2e' : '#fff',
    panel2: isDark ? '#0c1628' : '#fafafa',
    stroke: isDark ? 'rgba(255,255,255,0.10)' : '#e8e8e8',
    stroke2: isDark ? 'rgba(255,255,255,0.18)' : '#d9d9d9',
    text: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a',
    muted: isDark ? 'rgba(255,255,255,0.55)' : '#888',
    accent: isDark ? '#6ee7ff' : '#1677ff',
    good: '#22c55e',
    codeBg: isDark ? 'rgba(0,0,0,0.25)' : '#f5f5f5',
    sidebarBg: isDark ? 'rgba(255,255,255,0.02)' : '#fafafa',
    hoverBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    activeBg: isDark ? 'rgba(110,231,255,0.10)' : 'rgba(22,119,255,0.08)',
    activeText: isDark ? '#6ee7ff' : '#1677ff',
  };
};

// ==================== 数据类型 ====================

/** 章节（从 CatalogueStruct 第二层映射而来） */
interface Chapter {
  catalogueId: string;  // 对应后端 catalogue_id
  title: string;
  sections: Section[];
}

/** 小节（从 CatalogueStruct 第三层映射而来） */
interface Section {
  catalogueId: string;
  title: string;
  desc: string;
  postId: string;  // 绑定的文章 ID，"0" 表示未绑定
  /** 完整的后端目录信息，用于更新操作 */
  catalogue: CatalogueDetail;
}

// ==================== 工具函数 ====================

/** 流式调用 Agent */
function callAgentStream(
  agentId: number, apiKey: string, content: string,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: string) => void,
): StreamClient {
  const sessionId = `ailearn_teach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let accumulated = '';
  const client = runAgentStream({
    agent_id: agentId, api_key: apiKey,
    agent_message: {
      agent_id: agentId, agent_session_id: sessionId,
      message_agent_session_id: sessionId, role: 'user',
      message_type: 0, message_content: content,
    },
  });
  client.addEventListener('message', (data) => {
    const parsed = data as RunAgentStreamResp;
    try {
      if (parsed.type === 'content') {
        const d = JSON.parse(parsed.data);
        accumulated += d.content;
        onChunk(accumulated);
      } else if (parsed.type === 'message_end') {
        onDone(accumulated);
        client.close();
      } else if (parsed.type === 'error') {
        const d = JSON.parse(parsed.data);
        onError(d.message || '未知错误');
        client.close();
      }
    } catch (err) { console.error('Stream parse error:', err); }
  });
  client.addEventListener('error', () => { onError('网络连接错误'); });
  return client;
}

/** 预处理 Markdown（修复 details/summary 标签前后缺少空行的问题） */
function preprocessMarkdown(md: string): string {
  return md
    .replace(/([^\n])\n(<details)/g, '$1\n\n$2')
    .replace(/(<\/details>)\n([^\n])/g, '$1\n\n$2')
    .replace(/([^\n])\n(<summary)/g, '$1\n\n$2')
    .replace(/(<\/summary>)\n([^\n])/g, '$1\n\n$2');
}

/** 判断代码块是否可以运行（排除 shell/配置类代码） */
function isRunnableCode(code: string, lang: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  const shellLangs = ['bash', 'shell', 'sh', 'cmd', 'powershell', 'bat', 'zsh', ''];
  if (shellLangs.includes(lang.toLowerCase())) return false;
  const skipLangs = ['dockerfile', 'docker', 'nginx', 'html', 'css', 'yaml', 'yml', 'json', 'xml', 'toml', 'ini', 'conf', 'http', 'text', 'plaintext', 'txt', 'markdown', 'md'];
  if (skipLangs.includes(lang.toLowerCase())) return false;
  const codeLines = trimmed.split('\n').filter(l => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('#') && !t.startsWith('--') && !t.startsWith('/*') && !t.startsWith('*');
  });
  return codeLines.length >= 2;
}

/**
 * 将后端 CatalogueStruct 树映射为前端 Chapter[] 结构
 * 树结构：根 → 章节(level 1) → 小节(level 2)
 */
function mapCatalogueToChapters(tree: CatalogueStruct): Chapter[] {
  if (!tree.catalogue_struct) return [];
  return tree.catalogue_struct.map(chapterNode => {
    const chapterCat = chapterNode.catalogue;
    return {
      catalogueId: chapterCat?.catalogue_id || '0',
      title: chapterCat?.title || '未命名章节',
      sections: (chapterNode.catalogue_struct || []).map(sectionNode => {
        const secCat = sectionNode.catalogue;
        return {
          catalogueId: secCat?.catalogue_id || '0',
          title: secCat?.title || '未命名小节',
          desc: secCat?.desc || '',
          postId: secCat?.post_id || '0',
          catalogue: secCat!,
        };
      }),
    };
  });
}

// ==================== 可编辑代码块组件 ====================
const EditableCodeBlock: React.FC<{
  initialCode: string;
  lang: string;
  isDark: boolean;
  runnable: boolean;
  onRun: (code: string, lang: string) => void;
  colors: ReturnType<typeof useThemeColors>;
  editsMap: React.MutableRefObject<Map<string, string>>;
}> = ({ initialCode, lang, isDark, runnable, onRun, colors, editsMap }) => {
  const [code, setCode] = useState(() => editsMap.current.get(initialCode) ?? initialCode);
  const isEdited = code !== initialCode;
  const lineCount = code.split('\n').length;
  const height = Math.min(Math.max(lineCount * 20 + 20, 68), 420);

  const handleChange = (val: string) => { setCode(val); editsMap.current.set(initialCode, val); };
  const handleReset = () => { setCode(initialCode); editsMap.current.delete(initialCode); };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 12px', fontSize: 11, fontWeight: 600,
        color: colors.isDark ? 'rgba(255,255,255,0.45)' : '#999',
        background: colors.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.06)',
        borderRadius: '8px 8px 0 0',
        border: `1px solid ${colors.stroke}`, borderBottom: 'none',
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        <span>{lang || 'code'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isEdited && (
            <Tooltip title="重置为原始代码">
              <Button size="small" icon={<UndoOutlined />} onClick={handleReset} style={{ fontSize: 11, height: 22, borderRadius: 6 }} />
            </Tooltip>
          )}
          {runnable && (
            <Tooltip title="让 AI 运行此代码">
              <Button type="primary" size="small" icon={<CaretRightOutlined />} onClick={() => onRun(code, lang)}
                style={{ opacity: 0.9, fontSize: 11, height: 22, borderRadius: 6 }}>运行</Button>
            </Tooltip>
          )}
        </div>
      </div>
      <div style={{ border: `1px solid ${colors.stroke}`, borderRadius: '0 0 8px 8px', overflow: 'hidden', height }}>
        <CodeEditor value={code} onChange={handleChange} language={lang || 'bash'} isDark={isDark} />
      </div>
    </div>
  );
};

// ==================== 教学页面主组件 ====================
const TeachingPage: React.FC = () => {
  const { catalogueId: catalogueIdStr } = useParams<{ catalogueId: string }>();
  const catalogueId = catalogueIdStr || '';
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();
  const { user } = useAuth();
  const colors = useThemeColors();

  // ===== 目录数据（来自后端） =====
  const [rootTitle, setRootTitle] = useState('');      // 根目录标题（如"Go 语言"）
  const [rootDesc, setRootDesc] = useState('');        // 根目录描述
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoadingOutline, setIsLoadingOutline] = useState(true);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<{ chapterIdx: number; sectionIdx: number } | null>(null);

  // ===== 教学内容 =====
  const [sectionContent, setSectionContent] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentProgress, setContentProgress] = useState('');
  const contentCacheRef = useRef<Map<string, string>>(new Map()); // key = catalogueId
  const codeEditsRef = useRef<Map<string, string>>(new Map());

  // ===== AI 对话 =====
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const chatStreamRef = useRef<StreamClient | null>(null);
  const chatAssistantRef = useRef('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  /** 当前对话的持久会话 ID，清空对话时重新生成 */
  const chatSessionIdRef = useRef(`ailearn_teach_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  /** 标记本轮对话是否为首次发送（首次需要带上下文） */
  const isFirstChatRef = useRef(true);

  // ===== 面板与布局 =====
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(0.22);
  const [rightWidth, setRightWidth] = useState(0.24);
  const leftWidthRef = useRef(0.22);
  const rightWidthRef = useRef(0.24);
  const [isAiPanelVisible, setIsAiPanelVisible] = useState(true);
  const prevRightWidthRef = useRef(0.24);
  const draggingRef = useRef<string | null>(null);
  const contentStreamRef = useRef<StreamClient | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ===== 自动滚动 =====
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  useEffect(() => {
    if (isLoadingContent && contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [contentProgress, isLoadingContent]);

  // ===== 清理 =====
  useEffect(() => {
    return () => { chatStreamRef.current?.close(); contentStreamRef.current?.close(); };
  }, []);

  // ===== 加载目录树（核心变更：从后端获取，不再 AI 生成） =====
  useEffect(() => {
    if (!catalogueId) return;
    setIsLoadingOutline(true);
    getCatalogueDetail({ catalogue_id: catalogueId })
      .then(resp => {
        const tree = resp.catalogue_struct;
        if (tree?.catalogue) {
          setRootTitle(tree.catalogue.title);
          setRootDesc(tree.catalogue.desc);
        }
        const mapped = mapCatalogueToChapters(tree);
        setChapters(mapped);
        // 默认展开第一章
        if (mapped.length > 0) setExpandedChapters(new Set([mapped[0].catalogueId]));
      })
      .catch(() => { /* client 已处理 */ })
      .finally(() => setIsLoadingOutline(false));
  }, [catalogueId]);

  // ===== 面板拖拽（直接操作 DOM 提升性能） =====
  const handleMouseDown = useCallback((kind: string) => {
    draggingRef.current = kind;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    let rafId = 0;
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!draggingRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const totalW = rect.width;
        if (draggingRef.current === 'left') {
          const v = Math.max(0.14, Math.min(0.35, (e.clientX - rect.left) / totalW));
          leftWidthRef.current = v;
          if (leftPanelRef.current) leftPanelRef.current.style.width = `${v * 100}%`;
        } else if (draggingRef.current === 'right') {
          const newW = (rect.right - e.clientX) / totalW;
          if (newW < 0.08) {
            prevRightWidthRef.current = rightWidthRef.current > 0.12 ? rightWidthRef.current : 0.24;
            rightWidthRef.current = 0;
            if (rightPanelRef.current) rightPanelRef.current.style.width = '0%';
            setIsAiPanelVisible(false);
            draggingRef.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            setLeftWidth(leftWidthRef.current);
            setRightWidth(0);
            return;
          }
          const v = Math.max(0.15, Math.min(0.38, newW));
          rightWidthRef.current = v;
          if (rightPanelRef.current) rightPanelRef.current.style.width = `${v * 100}%`;
        }
      });
    };
    const handleMouseUp = () => {
      if (draggingRef.current) { setLeftWidth(leftWidthRef.current); setRightWidth(rightWidthRef.current); }
      draggingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); cancelAnimationFrame(rafId); };
  }, []);

  // ===== AI 面板切换 =====
  const toggleAiPanel = useCallback(() => {
    if (isAiPanelVisible) {
      prevRightWidthRef.current = rightWidth > 0.12 ? rightWidth : 0.24;
      rightWidthRef.current = 0; setRightWidth(0); setIsAiPanelVisible(false);
    } else {
      const w = prevRightWidthRef.current || 0.24;
      rightWidthRef.current = w; setRightWidth(w); setIsAiPanelVisible(true);
    }
  }, [isAiPanelVisible, rightWidth]);

  // ===== 加载小节内容（核心逻辑） =====
  const handleLoadSection = (chapterIdx: number, sectionIdx: number) => {
    const chapter = chapters[chapterIdx];
    const section = chapter.sections[sectionIdx];

    // 相同小节点击忽略
    if (activeSection?.chapterIdx === chapterIdx && activeSection?.sectionIdx === sectionIdx && !isLoadingContent) return;

    // 取消正在进行的流
    if (isLoadingContent) {
      contentStreamRef.current?.close();
      contentStreamRef.current = null;
      setIsLoadingContent(false);
    }

    setActiveSection({ chapterIdx, sectionIdx });

    // 1. 检查本地缓存
    const cached = contentCacheRef.current.get(section.catalogueId);
    if (cached) {
      setSectionContent(cached);
      setContentProgress('');
      if (contentRef.current) contentRef.current.scrollTop = 0;
      return;
    }

    // 2. post_id 有效 → 从后端获取已有文章
    if (section.postId && section.postId !== '0') {
      setIsLoadingContent(true);
      setSectionContent('');
      setContentProgress('');
      getPostDetail({ post_id: section.postId })
        .then(resp => {
          const content = resp.post?.post_base?.content || '文章内容为空';
          setSectionContent(content);
          contentCacheRef.current.set(section.catalogueId, content);
          if (contentRef.current) contentRef.current.scrollTop = 0;
        })
        .catch(() => { setSectionContent('加载文章失败'); })
        .finally(() => setIsLoadingContent(false));
      return;
    }

    // 3. post_id === "0" 且未登录 → 提示登录
    if (!user) {
      setSectionContent('');
      setContentProgress('');
      return;
    }

    // 4. post_id === "0" 且已登录 → AI 生成 → 创建文章 → 绑定目录
    setIsLoadingContent(true);
    setSectionContent('');
    setContentProgress('');

    const prompt = `请为「${rootTitle}」课程中的「${chapter.title} - ${section.title}」生成详细的教学内容。${section.desc ? `补充描述为：${section.desc}` : ''}`;

    const { agent_id, api_key } = AGENT_CONFIG.contentGenerator;
    contentStreamRef.current?.close();
    contentStreamRef.current = callAgentStream(
      agent_id, api_key, prompt,
      (text) => setContentProgress(text),
      async (fullText) => {
        contentStreamRef.current = null;
        setSectionContent(fullText);
        setContentProgress('');
        contentCacheRef.current.set(section.catalogueId, fullText);
        if (contentRef.current) contentRef.current.scrollTop = 0;

        // AI 生成完毕 → 保存为帖子并绑定到目录
        try {
          // 创建帖子
          const postResp = await createPost({
            title: `${chapter.title} - ${section.title}`,
            content: fullText,
            images: [],
            theme: rootTitle,
            tags: [],
            status: 1,
          });
          const newPostId = postResp.post_id;

          // 更新目录绑定 post_id
          await updateCatalogue({
            catalogue_detail: { ...section.catalogue, post_id: newPostId },
            catalogue_id: section.catalogueId,
            update_field: ['post_id'],
          });

          // 更新本地 chapters 状态，避免重复生成
          setChapters(prev => {
            const next = [...prev];
            const ch = { ...next[chapterIdx] };
            const secs = [...ch.sections];
            secs[sectionIdx] = { ...secs[sectionIdx], postId: newPostId };
            ch.sections = secs;
            next[chapterIdx] = ch;
            return next;
          });
        } catch (err) {
          console.error('保存文章失败:', err);
          // 不影响内容展示，用户可以正常阅读 AI 生成的内容
        }

        setIsLoadingContent(false);
      },
      (err) => {
        setIsLoadingContent(false);
        contentStreamRef.current = null;
        setSectionContent(`加载失败: ${err}`);
      },
    );
  };

  // ===== 切换章节展开 =====
  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ===== AI 对话 =====
  const handleChatSend = () => {
    if (!chatInput.trim() || isChatStreaming) return;
    const { agent_id, api_key } = AGENT_CONFIG.teachingAssistant;

    // 仅在本轮首次发送且开启上下文时，携带教学内容
    let userContent = chatInput;
    if (isFirstChatRef.current && includeContext && sectionContent && activeSection) {
      const sec = chapters[activeSection.chapterIdx]?.sections[activeSection.sectionIdx];
      userContent = `[当前学习科目: ${rootTitle}]
[当前章节: ${sec?.title || ''}]
[教学内容摘要]:
${sectionContent.slice(0, 3000)}

[我的问题]: ${chatInput}`;
    }
    isFirstChatRef.current = false;

    setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]);
    setChatInput('');
    setIsChatStreaming(true);
    chatAssistantRef.current = '';

    const sessionId = chatSessionIdRef.current;
    chatStreamRef.current?.close();
    const client = runAgentStream({
      agent_id, api_key,
      agent_message: { agent_id, agent_session_id: sessionId, message_agent_session_id: sessionId, role: 'user', message_type: 0, message_content: userContent },
    });
    chatStreamRef.current = client;
    client.addEventListener('message', (data) => {
      const parsed = data as RunAgentStreamResp;
      try {
        if (parsed.type === 'content') {
          const d = JSON.parse(parsed.data);
          chatAssistantRef.current += d.content;
          const snapshot = chatAssistantRef.current;
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') { const arr = [...prev]; arr[arr.length - 1] = { ...last, content: snapshot }; return arr; }
            return [...prev, { role: 'assistant', content: snapshot }];
          });
        } else if (parsed.type === 'message_end') { setIsChatStreaming(false); chatStreamRef.current = null; chatAssistantRef.current = ''; }
        else if (parsed.type === 'error') {
          const d = JSON.parse(parsed.data);
          setChatMessages(prev => [...prev, { role: 'assistant', content: `错误: ${d.message}` }]);
          setIsChatStreaming(false);
        }
      } catch (err) { console.error('Chat stream error:', err); }
    });
    client.addEventListener('error', () => { setIsChatStreaming(false); chatStreamRef.current = null; });
  };

  // ===== 运行代码 =====
  const handleRunCode = (codeStr: string, lang: string) => {
    if (!isAiPanelVisible) { setRightWidth(prevRightWidthRef.current || 0.24); setIsAiPanelVisible(true); }
    const prompt = `请执行以下 ${lang} 代码并返回运行结果：\n\n\`\`\`${lang}\n${codeStr}\n\`\`\``;
    const { agent_id, api_key } = AGENT_CONFIG.teachingAssistant;
    setChatMessages(prev => [...prev, { role: 'user', content: `▶ 运行代码:\n\`\`\`${lang}\n${codeStr}\n\`\`\`` }]);
    setIsChatStreaming(true);
    chatAssistantRef.current = '';
    const sessionId = chatSessionIdRef.current;
    chatStreamRef.current?.close();
    const client = runAgentStream({
      agent_id, api_key,
      agent_message: { agent_id, agent_session_id: sessionId, message_agent_session_id: sessionId, role: 'user', message_type: 0, message_content: prompt },
    });
    chatStreamRef.current = client;
    client.addEventListener('message', (data) => {
      const parsed = data as RunAgentStreamResp;
      try {
        if (parsed.type === 'content') {
          const d = JSON.parse(parsed.data);
          chatAssistantRef.current += d.content;
          const snapshot = chatAssistantRef.current;
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') { const arr = [...prev]; arr[arr.length - 1] = { ...last, content: snapshot }; return arr; }
            return [...prev, { role: 'assistant', content: snapshot }];
          });
        } else if (parsed.type === 'message_end') { setIsChatStreaming(false); chatStreamRef.current = null; }
      } catch { /* ignore */ }
    });
    client.addEventListener('error', () => { setIsChatStreaming(false); chatStreamRef.current = null; });
  };

  // ===== heading 渲染器 =====
  const createHeadingRenderer = (level: number) => {
    return ({ children, ...props }: any) => {
      if (level === 1) return <h1 {...props}>{children}</h1>;
      if (level === 2) return <h2 {...props}>{children}</h2>;
      return <h3 {...props}>{children}</h3>;
    };
  };

  // ===== 404 =====
  if (!catalogueId) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text>无效的模块 ID</Text><br />
        <Button type="link" onClick={() => navigate('/')}>返回首页</Button>
      </div>
    );
  }

  // ===== 获取当前选中小节信息 =====
  const currentSection = activeSection
    ? chapters[activeSection.chapterIdx]?.sections[activeSection.sectionIdx]
    : null;
  // 未登录且 postId==="0" 时显示的占位
  const needLogin = currentSection && (!currentSection.postId || currentSection.postId === '0') && !user;

  // ============================= JSX =============================
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: colors.bg }}>
      {/* ===== 顶部栏 ===== */}
      <header style={{
        height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
        borderBottom: `1px solid ${colors.stroke}`,
        background: colors.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.9)', flexShrink: 0,
      }}>
        <Tooltip title="返回首页">
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: colors.muted }} />
        </Tooltip>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOutlined style={{ fontSize: 14, color: colors.accent }} />
          <span style={{ fontWeight: 700, color: colors.text, fontSize: 14 }}>
            {rootTitle || '加载中...'} 教学
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <Tooltip title={isAiPanelVisible ? '收起 AI 助教' : '展开 AI 助教'}>
          <Button type="text" size="small"
            icon={isAiPanelVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
            onClick={toggleAiPanel}
            style={{ color: isAiPanelVisible ? colors.muted : colors.accent }} />
        </Tooltip>
        <Tooltip title={colors.isDark ? '亮色模式' : '暗色模式'}>
          <Button type="text" size="small" icon={colors.isDark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} style={{ color: colors.muted }} />
        </Tooltip>
      </header>

      {/* ===== 三栏主体 ===== */}
      <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ---- 左侧：课程目录（从后端数据渲染） ---- */}
        <section ref={leftPanelRef} style={{
          width: `${leftWidth * 100}%`, flexShrink: 0, height: '100%', overflow: 'hidden',
          borderRight: `1px solid ${colors.stroke}`, display: 'flex', flexDirection: 'column',
          background: colors.sidebarBg,
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${colors.stroke}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: colors.isDark ? 'rgba(255,255,255,0.02)' : '#fff', flexShrink: 0,
          }}>
            <span style={{ fontWeight: 650, fontSize: 13, color: colors.text }}>课程目录</span>
            <span style={{ fontSize: 11, color: colors.muted }}>{chapters.length > 0 ? `${chapters.length} 章` : ''}</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
            {isLoadingOutline ? (
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spin size="small" />
                <span style={{ fontSize: 12, color: colors.muted }}>加载目录...</span>
              </div>
            ) : chapters.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>
                <BookOutlined style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontSize: 13 }}>暂无目录</div>
              </div>
            ) : (
              chapters.map((chapter, ci) => {
                const isExpanded = expandedChapters.has(chapter.catalogueId);
                return (
                  <div key={chapter.catalogueId}>
                    {/* 章节标题 */}
                    <div
                      onClick={() => toggleChapter(chapter.catalogueId)}
                      style={{
                        padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        transition: 'background 0.15s', background: 'transparent', borderLeft: '3px solid transparent',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = colors.hoverBg)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 10, color: colors.muted, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><RightOutlined /></span>
                      <span style={{ fontSize: 11, color: colors.accent, fontWeight: 700, minWidth: 20 }}>{ci + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapter.title}</span>
                      <span style={{ fontSize: 11, color: colors.muted }}>{chapter.sections.length}</span>
                    </div>
                    {/* 小节列表 */}
                    {isExpanded && chapter.sections.map((section, si) => {
                      const isActive = activeSection?.chapterIdx === ci && activeSection?.sectionIdx === si;
                      const hasContent = (section.postId && section.postId !== '0') || contentCacheRef.current.has(section.catalogueId);
                      return (
                        <div key={section.catalogueId}>
                          <div
                            onClick={() => handleLoadSection(ci, si)}
                            style={{
                              padding: '6px 14px 6px 38px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                              transition: 'background 0.15s',
                              background: isActive ? colors.activeBg : 'transparent',
                              borderLeft: `3px solid ${isActive ? colors.activeText : 'transparent'}`,
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = colors.hoverBg; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <span style={{ fontSize: 11, color: colors.muted, minWidth: 24 }}>{ci + 1}.{si + 1}</span>
                            <span style={{ fontSize: 12.5, color: isActive ? colors.activeText : colors.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>{section.title}</span>
                            {isActive && isLoadingContent && <LoadingOutlined style={{ fontSize: 11, color: colors.accent }} />}
                            {/* 绿色圆点表示已有内容 */}
                            {hasContent && !isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.good, flexShrink: 0 }} />}
                            {hasContent && isActive && !isLoadingContent && <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.good, flexShrink: 0 }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 左拖拽条 */}
        <div onMouseDown={() => handleMouseDown('left')} style={{ width: 6, cursor: 'col-resize', position: 'relative', zIndex: 5, flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: 36, transform: 'translate(-50%,-50%)', borderRadius: 999, background: colors.isDark ? 'rgba(255,255,255,0.15)' : '#d9d9d9' }} />
        </div>

        {/* ---- 中间：教学内容 ---- */}
        <section style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: colors.panel }}>
          <div ref={contentRef} style={{ flex: 1, overflow: 'auto', padding: '24px 32px 60px' }}>
            {/* 加载中（AI 流式生成） */}
            {isLoadingContent ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Spin size="small" />
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {currentSection && currentSection.postId && currentSection.postId !== '0' ? '加载文章...' : '正在生成教学内容...'}
                  </Text>
                </div>
                {contentProgress && (
                  <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.8 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}
                      components={{
                        h1: createHeadingRenderer(1), h2: createHeadingRenderer(2), h3: createHeadingRenderer(3),
                        code({ className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          if (!match) return <code className={className} {...props}>{children}</code>;
                          return (
                            <div style={{ position: 'relative' }}>
                              <pre style={{ background: colors.codeBg, padding: '14px 16px', borderRadius: 8, overflow: 'auto', border: `1px solid ${colors.stroke}` }}>
                                <code className={className} {...props}>{children}</code>
                              </pre>
                            </div>
                          );
                        },
                      }}
                    >
                      {preprocessMarkdown(contentProgress)}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ) : needLogin ? (
              /* 未登录提示 */
              <div style={{ textAlign: 'center', padding: '80px 20px', color: colors.muted }}>
                <LoginOutlined style={{ fontSize: 48, marginBottom: 20, opacity: 0.2 }} />
                <div style={{ fontSize: 16, marginBottom: 8 }}>该小节尚无内容</div>
                <div style={{ fontSize: 13, marginBottom: 16, opacity: 0.7 }}>登录后可由 AI 自动生成教学内容并保存</div>
                <Button type="primary" onClick={() => navigate('/auth')}>去登录</Button>
              </div>
            ) : sectionContent ? (
              /* 正常渲染文章 */
              <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.8 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}
                  components={{
                    h1: createHeadingRenderer(1), h2: createHeadingRenderer(2), h3: createHeadingRenderer(3),
                    code({ className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!match) return <code className={className} {...props}>{children}</code>;
                      const codeStr = String(children).replace(/\n$/, '');
                      const lang = match[1];
                      const runnable = isRunnableCode(codeStr, lang);
                      return (
                        <EditableCodeBlock initialCode={codeStr} lang={lang} isDark={colors.isDark}
                          runnable={runnable} onRun={handleRunCode} colors={colors} editsMap={codeEditsRef} />
                      );
                    },
                  }}
                >
                  {preprocessMarkdown(sectionContent)}
                </ReactMarkdown>
              </div>
            ) : (
              /* 空状态 */
              <div style={{ textAlign: 'center', padding: '80px 20px', color: colors.muted }}>
                <BookOutlined style={{ fontSize: 48, marginBottom: 20, opacity: 0.2 }} />
                <div style={{ fontSize: 16, marginBottom: 8 }}>选择左侧目录开始学习</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                  {chapters.length > 0 ? '点击左侧章节中的小节，查看或生成教学内容' : '正在加载课程目录...'}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 右拖拽条 */}
        {isAiPanelVisible && (
          <div onMouseDown={() => handleMouseDown('right')} style={{ width: 6, cursor: 'col-resize', position: 'relative', zIndex: 5, flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: 36, transform: 'translate(-50%,-50%)', borderRadius: 999, background: colors.isDark ? 'rgba(255,255,255,0.15)' : '#d9d9d9' }} />
          </div>
        )}

        {/* ---- 右侧：AI 对话 ---- */}
        {isAiPanelVisible && (
          <section ref={rightPanelRef} style={{
            width: `${rightWidth * 100}%`, flexShrink: 0, height: '100%', overflow: 'hidden',
            borderLeft: `1px solid ${colors.stroke}`,
          }}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: colors.panel2 }}>
              <div style={{
                padding: '10px 14px', borderBottom: `1px solid ${colors.stroke}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: colors.isDark ? 'rgba(255,255,255,0.02)' : '#fff', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RobotOutlined style={{ color: colors.accent }} />
                  <span style={{ fontWeight: 650, fontSize: 13, color: colors.text }}>AI 助教</span>
                </div>
                <Space size={4}>
                  <Tooltip title={includeContext ? '携带当前教学内容作为上下文，切换时需要清空对话生效' : '不携带上下文，切换时需要清空对话生效'}>
                    <Switch size="small" checked={includeContext} onChange={setIncludeContext} checkedChildren="上下文" unCheckedChildren="无上下文" />
                  </Tooltip>
                  <Tooltip title="清空对话">
                    <Button type="text" size="small" icon={<ClearOutlined />} onClick={() => {
                      setChatMessages([]);
                      chatSessionIdRef.current = `ailearn_teach_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                      isFirstChatRef.current = true;
                    }} style={{ color: colors.muted }} />
                  </Tooltip>
                  <Tooltip title="收起面板">
                    <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={toggleAiPanel} style={{ color: colors.muted }} />
                  </Tooltip>
                </Space>
              </div>
              {/* 对话列表 */}
              <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {chatMessages.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: colors.muted, fontSize: 13 }}>
                    <RobotOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} />
                    <div>对教学内容有疑问？直接问 AI</div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>开启「上下文」后，AI 能看到当前章节内容</div>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{
                    maxWidth: '92%', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                    border: `1px solid ${msg.role === 'user' ? (colors.isDark ? 'rgba(110,231,255,0.22)' : '#1677ff') : colors.stroke}`,
                    background: msg.role === 'user' ? (colors.isDark ? 'rgba(110,231,255,0.08)' : '#e6f4ff') : (colors.isDark ? 'rgba(255,255,255,0.03)' : '#fff'),
                    color: colors.text,
                  }}>
                    <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown></div>
                  </div>
                ))}
                {isChatStreaming && chatMessages[chatMessages.length - 1]?.role !== 'assistant' && (
                  <div style={{ alignSelf: 'flex-start', padding: '8px 12px' }}>
                    <Spin size="small" />
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>思考中...</Text>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {/* 输入框 */}
              <div style={{
                padding: 10, borderTop: `1px solid ${colors.stroke}`,
                background: colors.isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                display: 'flex', gap: 8, flexShrink: 0,
              }}>
                <TextArea value={chatInput} onChange={e => setChatInput(e.target.value)}
                  placeholder={includeContext ? '问 AI（携带教学内容上下文）...' : '问 AI...'}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                  disabled={isChatStreaming}
                  style={{ flex: 1, borderRadius: 10, fontSize: 13, resize: 'none' }} />
                <Button type="primary" icon={<SendOutlined />} onClick={handleChatSend}
                  loading={isChatStreaming} disabled={!chatInput.trim() || isChatStreaming}
                  style={{ borderRadius: 10, alignSelf: 'flex-end' }} />
              </div>
            </div>
          </section>
        )}

        {/* AI 面板收起时的展开按钮 */}
        {!isAiPanelVisible && (
          <div onClick={toggleAiPanel} style={{
            position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
            width: 28, height: 72, borderRadius: '8px 0 0 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: colors.isDark ? 'rgba(110,231,255,0.12)' : 'rgba(22,119,255,0.08)',
            border: `1px solid ${colors.isDark ? 'rgba(110,231,255,0.25)' : 'rgba(22,119,255,0.2)'}`,
            borderRight: 'none', transition: 'all 0.2s', zIndex: 10,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = colors.isDark ? 'rgba(110,231,255,0.22)' : 'rgba(22,119,255,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = colors.isDark ? 'rgba(110,231,255,0.12)' : 'rgba(22,119,255,0.08)'; }}
          >
            <RobotOutlined style={{ color: colors.accent, fontSize: 16 }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default TeachingPage;
