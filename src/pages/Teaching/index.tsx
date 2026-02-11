import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Typography,
  Tooltip,
  Input,
  Spin,
  Switch,
  Space,
} from 'antd';
import {
  ArrowLeftOutlined,
  SunOutlined,
  MoonOutlined,
  SendOutlined,
  RobotOutlined,
  ClearOutlined,
  LoadingOutlined,
  BookOutlined,
  RightOutlined,
  ReloadOutlined,
  CaretRightOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useTheme } from '../../contexts/ThemeContext';
import { subjects } from '../../config/subjects';
import { runAgentStream } from '../../api/agent';
import type { StreamClient } from '../../api/agent';
import type { RunAgentStreamResp } from '../../types/agent';
import { AGENT_CONFIG, SUBJECT_PROMPT_MAP, SUBJECT_LANGUAGE_MAP } from '../../config/agents';
import CodeEditor from '../../components/CodeEditor';

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
    warn: '#f59e0b',
    codeBg: isDark ? 'rgba(0,0,0,0.25)' : '#f5f5f5',
    subtleBg: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    sidebarBg: isDark ? 'rgba(255,255,255,0.02)' : '#fafafa',
    hoverBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    activeBg: isDark ? 'rgba(110,231,255,0.10)' : 'rgba(22,119,255,0.08)',
    activeText: isDark ? '#6ee7ff' : '#1677ff',
  };
};

// ==================== 数据类型 ====================
interface Section { id: string; title: string; desc?: string; }
interface Chapter { id: string; title: string; sections: Section[]; }

// ==================== 流式调用工具 ====================
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

// ==================== JSON 提取工具 ====================
function repairJSON(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\' && i + 1 < str.length) {
      const next = str[i + 1];
      if ('"\\/bfnrtu'.includes(next)) { result += str[i]; } else { result += '\\\\'; }
    } else { result += str[i]; }
  }
  return result;
}
function tryParse(str: string): any | null {
  try { return JSON.parse(str); } catch { /* */ }
  try { return JSON.parse(repairJSON(str)); } catch { /* */ }
  return null;
}
function extractJSON(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) { const p = tryParse(trimmed); if (p) return JSON.stringify(p); }
  const jsonBlockMatch = trimmed.match(/```json\s*\n([\s\S]*?)```/);
  if (jsonBlockMatch) { const p = tryParse(jsonBlockMatch[1].trim()); if (p) return JSON.stringify(p); }
  const startIdx = trimmed.indexOf('{');
  if (startIdx !== -1) {
    let depth = 0, inString = false, escape = false;
    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++; else if (ch === '}') {
        depth--;
        if (depth === 0) { const p = tryParse(trimmed.slice(startIdx, i + 1)); if (p) return JSON.stringify(p); }
      }
    }
  }
  return null;
}

// ==================== 预处理 Markdown ====================
function preprocessMarkdown(md: string): string {
  return md
    .replace(/([^\n])\n(<details)/g, '$1\n\n$2')
    .replace(/(<\/details>)\n([^\n])/g, '$1\n\n$2')
    .replace(/([^\n])\n(<summary)/g, '$1\n\n$2')
    .replace(/(<\/summary>)\n([^\n])/g, '$1\n\n$2');
}


// ==================== 判断代码块是否可执行 ====================
function isRunnableCode(code: string, lang: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  // shell/命令行类: 不可执行
  const shellLangs = ['bash', 'shell', 'sh', 'cmd', 'powershell', 'bat', 'zsh', ''];
  if (shellLangs.includes(lang.toLowerCase())) return false;
  // 配置/标记语言: 不可执行
  const skipLangs = ['dockerfile', 'docker', 'nginx', 'html', 'css', 'yaml', 'yml', 'json', 'xml', 'toml', 'ini', 'conf', 'http', 'text', 'plaintext', 'txt', 'markdown', 'md'];
  if (skipLangs.includes(lang.toLowerCase())) return false;
  // 编程语言：至少两行有效代码才可执行
  const codeLines = trimmed.split('\n').filter(l => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('#') && !t.startsWith('--') && !t.startsWith('/*') && !t.startsWith('*');
  });
  return codeLines.length >= 2;
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
  // 用 initialCode 做 key，从外部 map 恢复用户编辑（防止 ReactMarkdown 重建组件丢失编辑）
  const [code, setCode] = useState(() => editsMap.current.get(initialCode) ?? initialCode);
  const isEdited = code !== initialCode;
  const lineCount = code.split('\n').length;
  const height = Math.min(Math.max(lineCount * 20 + 20, 68), 420);

  const handleChange = (val: string) => {
    setCode(val);
    editsMap.current.set(initialCode, val);
  };
  const handleReset = () => {
    setCode(initialCode);
    editsMap.current.delete(initialCode);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      {/* 语言标签 + 运行按钮 头部栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 12px',
        fontSize: 11, fontWeight: 600,
        color: colors.isDark ? 'rgba(255,255,255,0.45)' : '#999',
        background: colors.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.06)',
        borderRadius: '8px 8px 0 0',
        border: `1px solid ${colors.stroke}`,
        borderBottom: 'none',
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        <span>{lang || 'code'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isEdited && (
            <Tooltip title="重置为原始代码">
              <Button
                size="small"
                icon={<UndoOutlined />}
                onClick={handleReset}
                style={{ fontSize: 11, height: 22, borderRadius: 6 }}
              />
            </Tooltip>
          )}
          {runnable && (
            <Tooltip title="让 AI 运行此代码">
              <Button
                type="primary"
                size="small"
                icon={<CaretRightOutlined />}
                onClick={() => onRun(code, lang)}
                style={{ opacity: 0.9, fontSize: 11, height: 22, borderRadius: 6 }}
              >
                运行
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
      <div style={{
        border: `1px solid ${colors.stroke}`,
        borderRadius: '0 0 8px 8px',
        overflow: 'hidden',
        height,
      }}>
        <CodeEditor
          value={code}
          onChange={handleChange}
          language={lang || 'bash'}
          isDark={isDark}
        />
      </div>
    </div>
  );
};

// ==================== 教学页面主组件 ====================
const TeachingPage: React.FC = () => {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();
  const colors = useThemeColors();
  const subject = subjects.find((s) => s.id === subjectId);
  const subjectLang = SUBJECT_LANGUAGE_MAP[subjectId || ''] || 'bash';

  // ===== 大纲状态 =====
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoadingOutline, setIsLoadingOutline] = useState(false);
  const [outlineProgress, setOutlineProgress] = useState('');
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<{ chapterId: string; sectionId: string } | null>(null);

  // ===== 教学内容状态 =====
  const [sectionContent, setSectionContent] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentProgress, setContentProgress] = useState('');
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const codeEditsRef = useRef<Map<string, string>>(new Map());

  // ===== AI 对话 =====
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const chatStreamRef = useRef<StreamClient | null>(null);
  const chatAssistantRef = useRef('');
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // （已移除小节目录展开功能，改为绿色标识）

  // ===== 流引用 =====
  const outlineStreamRef = useRef<StreamClient | null>(null);
  const contentStreamRef = useRef<StreamClient | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outlineScrollRef = useRef<HTMLDivElement>(null);

  // heading ID 通过 useEffect + DOM 操作分配，不再使用 render 计数器

  // ===== 聊天自动滚动 =====
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // ===== 清理 =====
  useEffect(() => {
    return () => { chatStreamRef.current?.close(); outlineStreamRef.current?.close(); contentStreamRef.current?.close(); };
  }, []);

  // ===== 自动加载大纲 =====
  const hasAutoLoaded = useRef(false);
  useEffect(() => {
    if (!hasAutoLoaded.current && subject) {
      hasAutoLoaded.current = true;
      setTimeout(() => handleLoadOutline(), 300);
    }
  }, [subject]);

  // ===== 内容加载时自动滚到底 =====
  useEffect(() => {
    if (isLoadingContent && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [contentProgress, isLoadingContent]);

  // ===== 大纲流式输出自动滚到底 =====
  useEffect(() => {
    if (isLoadingOutline && outlineScrollRef.current) {
      outlineScrollRef.current.scrollTop = outlineScrollRef.current.scrollHeight;
    }
  }, [outlineProgress, isLoadingOutline]);

  // ===== 面板拖拽逻辑（直接操作 DOM 避免频繁 re-render） =====
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
            // 同步 state
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
      if (draggingRef.current) {
        setLeftWidth(leftWidthRef.current);
        setRightWidth(rightWidthRef.current);
      }
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
      rightWidthRef.current = 0;
      setRightWidth(0);
      setIsAiPanelVisible(false);
    } else {
      const w = prevRightWidthRef.current || 0.24;
      rightWidthRef.current = w;
      setRightWidth(w);
      setIsAiPanelVisible(true);
    }
  }, [isAiPanelVisible, rightWidth]);

  // ===== 加载课程大纲（含流式输出） =====
  const handleLoadOutline = () => {
    if (isLoadingOutline) return;
    setIsLoadingOutline(true);
    setChapters([]);
    setOutlineProgress('');

    const prompt = `请为「${subject?.name}」生成教学大纲。科目描述：${SUBJECT_PROMPT_MAP[subjectId || ''] || subject?.name}`;
    const { agent_id, api_key } = AGENT_CONFIG.outlineGenerator;
    outlineStreamRef.current?.close();
    outlineStreamRef.current = callAgentStream(
      agent_id, api_key, prompt,
      (text) => setOutlineProgress(text),
      (fullText) => {
        setIsLoadingOutline(false);
        setOutlineProgress('');
        outlineStreamRef.current = null;
        try {
          const jsonStr = extractJSON(fullText);
          if (!jsonStr) throw new Error('未找到 JSON');
          const data = JSON.parse(jsonStr);
          if (data.chapters && Array.isArray(data.chapters)) {
            setChapters(data.chapters);
            if (data.chapters.length > 0) setExpandedChapters(new Set([data.chapters[0].id]));
          }
        } catch (err) { console.error('Parse outline error:', err); }
      },
      (err) => {
        setIsLoadingOutline(false);
        setOutlineProgress('');
        outlineStreamRef.current = null;
        console.error('Outline error:', err);
      },
    );
  };

  // ===== 加载章节内容（带缓存） =====
  const handleLoadSection = (chapter: Chapter, section: Section) => {
    const isAlreadyActive = activeSection?.chapterId === chapter.id && activeSection?.sectionId === section.id;

    // 点击已激活的小节 → 不做任何操作
    if (isAlreadyActive && !isLoadingContent) {
      return;
    }

    // 正在加载中切换到其他小节 → 取消当前流并切换
    if (isLoadingContent) {
      contentStreamRef.current?.close();
      contentStreamRef.current = null;
      setIsLoadingContent(false);
    }

    setActiveSection({ chapterId: chapter.id, sectionId: section.id });

    // 检查缓存
    const cacheKey = `${chapter.id}::${section.id}`;
    const cached = contentCacheRef.current.get(cacheKey);
    if (cached) {
      setSectionContent(cached);
      setContentProgress('');
      setIsLoadingContent(false);
      // 滚到顶部
      if (contentRef.current) contentRef.current.scrollTop = 0;
      return;
    }

    setIsLoadingContent(true);
    setSectionContent('');
    setContentProgress('');

    const prompt = `请为「${subject?.name}」课程中的「${chapter.title} - ${section.title}」生成详细的教学内容。${section.desc ? `内容描述：${section.desc}` : ''}`;
    const { agent_id, api_key } = AGENT_CONFIG.contentGenerator;
    contentStreamRef.current?.close();
    contentStreamRef.current = callAgentStream(
      agent_id, api_key, prompt,
      (text) => setContentProgress(text),
      (fullText) => {
        setIsLoadingContent(false);
        contentStreamRef.current = null;
        setSectionContent(fullText);
        setContentProgress('');
        // 存入缓存
        contentCacheRef.current.set(cacheKey, fullText);
        // 滚到顶部
        if (contentRef.current) contentRef.current.scrollTop = 0;
      },
      (err) => {
        setIsLoadingContent(false);
        contentStreamRef.current = null;
        setSectionContent(`加载失败: ${err}`);
      },
    );
  };

  // ===== 切换章节展开 =====
  const toggleChapter = (chapterId: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId); else next.add(chapterId);
      return next;
    });
  };

  // ===== AI 对话 =====
  const handleChatSend = () => {
    if (!chatInput.trim() || isChatStreaming) return;
    const { agent_id, api_key } = AGENT_CONFIG.teachingAssistant;
    let userContent = chatInput;
    if (includeContext && sectionContent) {
      const activeSec = activeSection
        ? chapters.find(c => c.id === activeSection.chapterId)?.sections.find(s => s.id === activeSection.sectionId)
        : null;
      userContent = `[当前学习科目: ${subject?.name}]\n[当前章节: ${activeSec?.title || ''}]\n[教学内容摘要]:\n${sectionContent.slice(0, 3000)}\n\n[我的问题]: ${chatInput}`;
    }
    setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]);
    setChatInput('');
    setIsChatStreaming(true);
    chatAssistantRef.current = '';
    const sessionId = `ailearn_teach_chat_${subjectId}_${Date.now()}`;
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
        else if (parsed.type === 'error') { const d = JSON.parse(parsed.data); setChatMessages(prev => [...prev, { role: 'assistant', content: `错误: ${d.message}` }]); setIsChatStreaming(false); }
      } catch (err) { console.error('Chat stream error:', err); }
    });
    client.addEventListener('error', () => { setIsChatStreaming(false); chatStreamRef.current = null; });
  };

  // ===== 运行代码 =====
  const handleRunCode = (codeStr: string, lang: string) => {
    // 展开 AI 面板
    if (!isAiPanelVisible) {
      setRightWidth(prevRightWidthRef.current || 0.24);
      setIsAiPanelVisible(true);
    }
    const prompt = `请执行以下 ${lang} 代码并返回运行结果（只需要输出运行结果，不需要解释）：\n\n\`\`\`${lang}\n${codeStr}\n\`\`\``;
    const { agent_id, api_key } = AGENT_CONFIG.teachingAssistant;
    setChatMessages(prev => [...prev, { role: 'user', content: `▶ 运行代码:\n\`\`\`${lang}\n${codeStr}\n\`\`\`` }]);
    setIsChatStreaming(true);
    chatAssistantRef.current = '';
    const sessionId = `ailearn_run_${Date.now()}`;
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

  // ===== heading 渲染器（ID 由 useEffect 在 DOM 层统一分配，避免 StrictMode 双渲染导致编号错乱） =====
  const createHeadingRenderer = (level: number) => {
    return ({ children, ...props }: any) => {
      if (level === 1) return <h1 {...props}>{children}</h1>;
      if (level === 2) return <h2 {...props}>{children}</h2>;
      return <h3 {...props}>{children}</h3>;
    };
  };

  if (!subject) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text>科目不存在</Text><br />
        <Button type="link" onClick={() => navigate('/')}>返回首页</Button>
      </div>
    );
  }

  // midWidth 不再用于中间面板（改为 flex:1 自适应），仅保留兼容引用
  // const midWidth = 1 - leftWidth - (isAiPanelVisible ? rightWidth : 0);

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
          <span style={{ fontSize: 18 }}>{subject.icon}</span>
          <span style={{ fontWeight: 700, color: colors.text, fontSize: 14 }}>{subject.name} 教学</span>
        </div>
        <div style={{ width: 1, height: 20, background: colors.stroke, margin: '0 4px' }} />
        <BookOutlined style={{ color: colors.accent, fontSize: 14 }} />
        <span style={{ fontSize: 12, color: colors.muted }}>教学模式</span>
        <div style={{ flex: 1 }} />
        <Tooltip title="重新生成大纲">
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={handleLoadOutline} loading={isLoadingOutline} style={{ color: colors.muted }} />
        </Tooltip>
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

        {/* ---- 左侧：课程目录 ---- */}
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
          <div ref={outlineScrollRef} style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
            {isLoadingOutline ? (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Spin size="small" />
                  <span style={{ fontSize: 12, color: colors.muted }}>正在生成课程大纲...</span>
                </div>
                {outlineProgress && (
                  <div style={{
                    fontSize: 11, color: colors.muted, fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5,
                    maxHeight: 400, overflow: 'auto',
                    padding: 10, borderRadius: 6,
                    background: colors.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${colors.stroke}`,
                  }}>
                    {outlineProgress}
                  </div>
                )}
              </div>
            ) : chapters.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>
                <BookOutlined style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontSize: 13 }}>暂无大纲</div>
                <Button type="link" size="small" onClick={handleLoadOutline}>生成大纲</Button>
              </div>
            ) : (
              chapters.map((chapter, ci) => {
                const isExpanded = expandedChapters.has(chapter.id);
                return (
                  <div key={chapter.id}>
                    <div
                      onClick={() => toggleChapter(chapter.id)}
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
                    {isExpanded && chapter.sections.map((section, si) => {
                      const isActive = activeSection?.chapterId === chapter.id && activeSection?.sectionId === section.id;
                      const cacheKey = `${chapter.id}::${section.id}`;
                      const hasCached = contentCacheRef.current.has(cacheKey);
                      return (
                        <div key={section.id}>
                          <div
                            onClick={() => handleLoadSection(chapter, section)}
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
                            {hasCached && !isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#52c41a', flexShrink: 0 }} />}
                            {hasCached && isActive && !isLoadingContent && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#52c41a', flexShrink: 0 }} />}
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
        <section style={{
          flex: 1, minWidth: 0, height: '100%', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', background: colors.panel,
        }}>
          <div ref={contentRef} style={{ flex: 1, overflow: 'auto', padding: '24px 32px 60px' }}>
            {isLoadingContent ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Spin size="small" />
                  <Text type="secondary" style={{ fontSize: 13 }}>正在生成教学内容...</Text>
                </div>
                {contentProgress && (
                  <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.8 }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        h1: createHeadingRenderer(1),
                        h2: createHeadingRenderer(2),
                        h3: createHeadingRenderer(3),
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
            ) : sectionContent ? (
              <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.8 }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    h1: createHeadingRenderer(1),
                    h2: createHeadingRenderer(2),
                    h3: createHeadingRenderer(3),
                    code({ className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!match) return <code className={className} {...props}>{children}</code>;
                      const codeStr = String(children).replace(/\n$/, '');
                      const lang = match[1] || subjectLang;
                      const runnable = isRunnableCode(codeStr, lang);
                      return (
                        <EditableCodeBlock
                          initialCode={codeStr}
                          lang={lang}
                          isDark={colors.isDark}
                          runnable={runnable}
                          onRun={handleRunCode}
                          colors={colors}
                          editsMap={codeEditsRef}
                        />
                      );
                    },
                  }}
                >
                  {preprocessMarkdown(sectionContent)}
                </ReactMarkdown>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: colors.muted }}>
                <BookOutlined style={{ fontSize: 48, marginBottom: 20, opacity: 0.2 }} />
                <div style={{ fontSize: 16, marginBottom: 8 }}>选择左侧目录开始学习</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                  {chapters.length > 0 ? '点击左侧章节中的小节，AI 会实时生成专业教学内容' : '请等待课程大纲加载完成'}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 右拖拽条（仅 AI 面板可见时显示） */}
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
                  <Tooltip title={includeContext ? '携带当前教学内容作为上下文' : '不携带上下文'}>
                    <Switch size="small" checked={includeContext} onChange={setIncludeContext} checkedChildren="上下文" unCheckedChildren="无上下文" />
                  </Tooltip>
                  <Tooltip title="清空对话">
                    <Button type="text" size="small" icon={<ClearOutlined />} onClick={() => setChatMessages([])} style={{ color: colors.muted }} />
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
                    maxWidth: '92%',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                    border: `1px solid ${msg.role === 'user' ? (colors.isDark ? 'rgba(110,231,255,0.22)' : '#1677ff') : colors.stroke}`,
                    background: msg.role === 'user' ? (colors.isDark ? 'rgba(110,231,255,0.08)' : '#e6f4ff') : (colors.isDark ? 'rgba(255,255,255,0.03)' : '#fff'),
                    color: colors.text,
                  }}>
                    <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
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
          <div
            onClick={toggleAiPanel}
            style={{
              position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
              width: 28, height: 72, borderRadius: '8px 0 0 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: colors.isDark ? 'rgba(110,231,255,0.12)' : 'rgba(22,119,255,0.08)',
              border: `1px solid ${colors.isDark ? 'rgba(110,231,255,0.25)' : 'rgba(22,119,255,0.2)'}`,
              borderRight: 'none',
              transition: 'all 0.2s',
              zIndex: 10,
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
