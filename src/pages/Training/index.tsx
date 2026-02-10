import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Typography,
  Tooltip,
  Select,
  Space,
  Input,
  Spin,
  Switch,
  Tag,
} from 'antd';
import {
  ArrowLeftOutlined,
  SunOutlined,
  MoonOutlined,
  CaretRightOutlined,
  DeleteOutlined,
  BulbOutlined,
  SendOutlined,
  RobotOutlined,
  ClearOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '../../contexts/ThemeContext';
import { runAgentStream } from '../../api/agent';
import type { StreamClient } from '../../api/agent';
import type { RunAgentStreamResp } from '../../types/agent';
import type { Exercise, Difficulty } from '../../types/course';
import { AGENT_CONFIG, SUBJECT_LANGUAGE_MAP, SUBJECT_PROMPT_MAP } from '../../config/agents';
import { subjects } from '../../config/subjects';
import CodeEditor from '../../components/CodeEditor';

const { Text } = Typography;
const { TextArea } = Input;

// ==================== 主题色变量 ====================
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
  };
};

// ==================== 通用流式调用 Agent 工具 ====================
function callAgentStream(
  agentId: number,
  apiKey: string,
  content: string,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: string) => void,
): StreamClient {
  const sessionId = `ailearn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let accumulated = '';

  const client = runAgentStream({
    agent_id: agentId,
    api_key: apiKey,
    agent_message: {
      agent_id: agentId,
      agent_session_id: sessionId,
      message_agent_session_id: sessionId,
      role: 'user',
      message_type: 0,
      message_content: content,
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
    } catch (err) {
      console.error('Stream parse error:', err);
    }
  });

  client.addEventListener('error', () => {
    onError('网络连接错误');
  });

  return client;
}

// ==================== 修复 AI 输出的 Markdown 表格换行 ====================
function fixMarkdownTables(md: string): string {
  // AI 经常把表格的所有行挤在同一行，如:
  // | col1 | col2 | |---|---| | val1 | val2 | | val3 | val4 |
  // 需要拆成每行一个表格行

  return md.split('\n').map(line => {
    // 只处理包含分隔行模式 |---|---| 的行
    if (!/\|\s*[-:]{2,}\s*[-:|\s]*\|/.test(line)) return line;

    // 收集所有 | 的位置（忽略反引号内的 |）
    const pipePos: number[] = [];
    let inCode = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '`') inCode = !inCode;
      if (line[i] === '|' && !inCode) pipePos.push(i);
    }
    if (pipePos.length < 3) return line;

    // 取出每对 | 之间的 cell 内容
    const cells: string[] = [];
    for (let i = 0; i < pipePos.length - 1; i++) {
      cells.push(line.substring(pipePos[i] + 1, pipePos[i + 1]).trim());
    }

    // 找出连续的分隔 cell（内容全是 - 或 :）来确定列数
    let sepStart = -1, sepLen = 0;
    for (let i = 0; i < cells.length; i++) {
      if (/^[-:]+$/.test(cells[i])) {
        if (sepStart === -1) sepStart = i;
        sepLen++;
      } else if (sepStart !== -1) break;
    }
    if (sepLen === 0 || sepStart < 1) return line;

    const cols = sepLen;
    // 只有在总 cell 数能按列数整除时才处理（说明确实是多行挤在一起）
    if (cells.length <= cols || cells.length % cols !== 0) return line;

    // 按列数分组，每 cols 个 cell 组成一行
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += cols) {
      rows.push('| ' + cells.slice(i, i + cols).join(' | ') + ' |');
    }

    // 保留行首的非表格文本（如标题等）
    const prefix = line.substring(0, pipePos[0]).trim();
    const suffix = line.substring(pipePos[pipePos.length - 1] + 1).trim();
    let result = '';
    if (prefix) result += prefix + '\n';
    result += rows.join('\n');
    if (suffix) result += '\n' + suffix;
    return result;
  }).join('\n');
}

// ==================== 从 AI 输出中提取 JSON ====================
// 修复 AI 常见的非法 JSON 转义（如 \| \( \) 等）
function repairJSON(str: string): string {
  // JSON 合法转义: \" \\ \/ \b \f \n \r \t \uXXXX
  // 其他 \X 都是非法的，把 \X → \\X（让 JSON 里出现字面 \X）
  let result = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\' && i + 1 < str.length) {
      const next = str[i + 1];
      if ('"\\/bfnrtu'.includes(next)) {
        result += str[i]; // 合法转义，保留
      } else {
        result += '\\\\'; // 非法转义，双写反斜杠
      }
    } else {
      result += str[i];
    }
  }
  return result;
}

function tryParse(str: string): any | null {
  try { return JSON.parse(str); } catch { /* ignore */ }
  try { return JSON.parse(repairJSON(str)); } catch { /* ignore */ }
  return null;
}

function extractJSON(text: string): string | null {
  const trimmed = text.trim();

  // 1) 整个文本直接解析
  if (trimmed.startsWith('{')) {
    const parsed = tryParse(trimmed);
    if (parsed) return JSON.stringify(parsed);
  }

  // 2) ```json ... ``` 代码块
  const jsonBlockMatch = trimmed.match(/```json\s*\n([\s\S]*?)```/);
  if (jsonBlockMatch) {
    const parsed = tryParse(jsonBlockMatch[1].trim());
    if (parsed) return JSON.stringify(parsed);
  }

  // 3) 平衡括号提取最外层 { ... }
  const startIdx = trimmed.indexOf('{');
  if (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(startIdx, i + 1);
          const parsed = tryParse(candidate);
          if (parsed) return JSON.stringify(parsed);
        }
      }
    }
  }

  return null;
}

// ==================== 训练页面主组件 ====================
const TrainingPage: React.FC = () => {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();
  const colors = useThemeColors();

  const subject = subjects.find((s) => s.id === subjectId);
  const language = SUBJECT_LANGUAGE_MAP[subjectId || ''] || 'bash';

  // 当前练习题（AI 生成）
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [topic, setTopic] = useState('');

  // 代码
  const [code, setCode] = useState('');

  // 终端输出
  const [output, setOutput] = useState<
    { type: 'info' | 'ok' | 'error' | 'warn'; text: string }[]
  >([{ type: 'info', text: '[hint] 点击「生成题目」开始，或点击「运行」提交代码评判' }]);

  // 代码评判
  const [isJudging, setIsJudging] = useState(false);

  // AI 对话
  const [chatMessages, setChatMessages] = useState<
    { role: 'user' | 'assistant'; content: string; reasoning?: string }[]
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const chatStreamRef = useRef<StreamClient | null>(null);
  const chatAssistantRef = useRef({ content: '', reasoning: '' });
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 面板拖拽
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(0.28);
  const [rightWidth, setRightWidth] = useState(0.25);
  const [outputHeight, setOutputHeight] = useState(150); // 像素高度，0=完全收起
  const draggingRef = useRef<string | null>(null);

  // 其它 ref
  const generateStreamRef = useRef<StreamClient | null>(null);
  const judgeStreamRef = useRef<StreamClient | null>(null);
  const descPanelRef = useRef<HTMLDivElement>(null);

  // 聊天自动滚动
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // 生成题目时描述面板自动滚到底部
  useEffect(() => {
    if (isGenerating && descPanelRef.current) {
      descPanelRef.current.scrollTop = descPanelRef.current.scrollHeight;
    }
  }, [generateProgress, isGenerating]);

  // 清理
  useEffect(() => {
    return () => {
      chatStreamRef.current?.close();
      generateStreamRef.current?.close();
      judgeStreamRef.current?.close();
    };
  }, []);

  // 进入页面自动生成一道题
  const hasAutoGenerated = useRef(false);
  useEffect(() => {
    if (!hasAutoGenerated.current && subject) {
      hasAutoGenerated.current = true;
      // 用 setTimeout 确保组件完全挂载后再触发
      setTimeout(() => handleGenerateRef.current?.(), 300);
    }
  }, [subject]);

  // ===== 面板拖拽逻辑 =====
  const handleMouseDown = useCallback((kind: string) => {
    draggingRef.current = kind;
    document.body.style.cursor = kind === 'midH' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalW = rect.width;

      if (draggingRef.current === 'left') {
        setLeftWidth(Math.max(0.15, Math.min(0.45, (e.clientX - rect.left) / totalW)));
      } else if (draggingRef.current === 'right') {
        setRightWidth(Math.max(0.15, Math.min(0.40, (rect.right - e.clientX) / totalW)));
      } else if (draggingRef.current === 'midH') {
        const midRect = document.getElementById('mid-panel')?.getBoundingClientRect();
        if (midRect) {
          // 鼠标距面板底部的距离 = 输出面板高度
          const fromBottom = midRect.bottom - e.clientY;
          const maxH = midRect.height * 0.7; // 最高占 70%
          if (fromBottom <= 8) {
            setOutputHeight(0); // 拖到底部直接收起
          } else {
            setOutputHeight(Math.max(36, Math.min(maxH, fromBottom)));
          }
        }
      }
    };
    const handleMouseUp = () => {
      draggingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // ===== 生成题目 =====
  const handleGenerate = () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerateProgress('');
    setCurrentExercise(null);
    setCode('');
    setOutput([{ type: 'info', text: '[ai] 正在生成题目...' }]);

    const prompt = topic
      ? `请为 ${SUBJECT_PROMPT_MAP[subjectId || ''] || subjectId} 生成一道 ${difficulty} 难度的练习题，主题要求：${topic}`
      : `请为 ${SUBJECT_PROMPT_MAP[subjectId || ''] || subjectId} 随机生成一道 ${difficulty} 难度的练习题`;

    const { agent_id, api_key } = AGENT_CONFIG.exerciseGenerator;
    generateStreamRef.current?.close();
    generateStreamRef.current = callAgentStream(
      agent_id,
      api_key,
      prompt,
      (text) => setGenerateProgress(text),
      (fullText) => {
        setIsGenerating(false);
        generateStreamRef.current = null;
        try {
          const jsonStr = extractJSON(fullText);
          if (!jsonStr) throw new Error('未找到 JSON');
          const data = JSON.parse(jsonStr);
          const exercise: Exercise = {
            id: `gen_${Date.now()}`,
            subjectId: subjectId || '',
            title: data.title || '未命名题目',
            difficulty: data.difficulty || difficulty,
            language: data.language || language,
            desc: data.desc || '',
            detail: data.detail || '',
            hints: data.hints || [],
            initialCode: data.initialCode || '',
            expectedOutput: data.expectedOutput,
          };
          setCurrentExercise(exercise);
          setCode(exercise.initialCode);
          setOutput([{ type: 'ok', text: '[ok] 题目生成成功，开始作答吧！' }]);
        } catch (err) {
          console.error('Parse exercise error:', err);
          setOutput([
            { type: 'error', text: '[error] 题目解析失败，请重新生成' },
            { type: 'info', text: fullText.slice(0, 500) },
          ]);
        }
      },
      (err) => {
        setIsGenerating(false);
        generateStreamRef.current = null;
        setOutput([{ type: 'error', text: `[error] 生成失败: ${err}` }]);
      },
    );
  };

  // ref 保持最新的 handleGenerate 供自动触发使用
  const handleGenerateRef = useRef<(() => void) | null>(null);
  handleGenerateRef.current = handleGenerate;

  // ===== 运行 / AI 评判 =====
  const handleRun = () => {
    if (isJudging || !currentExercise) return;
    const codeContent = code.trim();
    if (!codeContent) {
      setOutput([{ type: 'warn', text: '[warn] 请先写点代码再提交' }]);
      return;
    }

    setIsJudging(true);
    // 评判时自动展开输出面板
    if (outputHeight < 120) setOutputHeight(180);
    setOutput([
      { type: 'info', text: '[judge] AI 评判官正在分析你的代码...' },
    ]);

    const prompt = `题目描述：\n${currentExercise.detail}\n\n预期输出：\n${currentExercise.expectedOutput || '无'}\n\n编程语言：${currentExercise.language}\n\n用户提交的代码：\n\`\`\`${currentExercise.language}\n${codeContent}\n\`\`\``;

    const { agent_id, api_key } = AGENT_CONFIG.codeJudge;
    judgeStreamRef.current?.close();
    judgeStreamRef.current = callAgentStream(
      agent_id,
      api_key,
      prompt,
      () => {}, // 不需要中间态
      (fullText) => {
        setIsJudging(false);
        judgeStreamRef.current = null;
        try {
          const jsonStr = extractJSON(fullText);
          if (!jsonStr) throw new Error('未找到 JSON');
          const result = JSON.parse(jsonStr);
          const lines: { type: 'info' | 'ok' | 'error' | 'warn'; text: string }[] = [];

          if (result.passed) {
            lines.push({ type: 'ok', text: `✅ 通过！得分: ${result.score}/100` });
          } else {
            lines.push({ type: 'error', text: `❌ 未通过  得分: ${result.score}/100` });
          }

          if (result.simulatedOutput) {
            lines.push({ type: 'info', text: `\n--- 模拟执行输出 ---` });
            lines.push({ type: 'info', text: result.simulatedOutput });
          }

          if (result.feedback) {
            lines.push({ type: 'info', text: `\n--- 反馈 ---` });
            lines.push({ type: 'warn', text: result.feedback });
          }

          if (result.suggestions?.length) {
            lines.push({ type: 'info', text: `\n--- 优化建议 ---` });
            result.suggestions.forEach((s: string, i: number) => {
              lines.push({ type: 'warn', text: `${i + 1}. ${s}` });
            });
          }

          setOutput(lines);
        } catch (err) {
          console.error('Parse judge error:', err);
          // 降级：直接显示 AI 回复
          setOutput([
            { type: 'info', text: '--- AI 评判结果 ---' },
            { type: 'info', text: fullText },
          ]);
        }
      },
      (err) => {
        setIsJudging(false);
        judgeStreamRef.current = null;
        setOutput([{ type: 'error', text: `[error] 评判失败: ${err}` }]);
      },
    );
  };

  // ===== AI 对话 =====
  const handleChatSend = () => {
    if (!chatInput.trim() || isChatStreaming) return;

    const { agent_id, api_key } = AGENT_CONFIG.teachingAssistant;
    let userContent = chatInput;
    if (includeContext && currentExercise) {
      userContent = `[当前题目: ${currentExercise.title}]\n[题目描述]:\n${currentExercise.detail}\n\n[我的代码]:\n\`\`\`${currentExercise.language}\n${code}\n\`\`\`\n\n[我的问题]: ${chatInput}`;
    }

    setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]);
    setChatInput('');
    setIsChatStreaming(true);
    chatAssistantRef.current = { content: '', reasoning: '' };

    const sessionId = `ailearn_chat_${subjectId}_${Date.now()}`;
    chatStreamRef.current?.close();

    const client = runAgentStream({
      agent_id,
      api_key,
      agent_message: {
        agent_id,
        agent_session_id: sessionId,
        message_agent_session_id: sessionId,
        role: 'user',
        message_type: 0,
        message_content: userContent,
      },
    });
    chatStreamRef.current = client;

    client.addEventListener('message', (data) => {
      const parsed = data as RunAgentStreamResp;
      try {
        if (parsed.type === 'content') {
          const d = JSON.parse(parsed.data);
          chatAssistantRef.current.content += d.content;
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              const arr = [...prev];
              arr[arr.length - 1] = { ...last, content: chatAssistantRef.current.content };
              return arr;
            }
            return [...prev, { role: 'assistant', content: chatAssistantRef.current.content }];
          });
        } else if (parsed.type === 'reasoning') {
          const d = JSON.parse(parsed.data);
          chatAssistantRef.current.reasoning += d.content;
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              const arr = [...prev];
              arr[arr.length - 1] = { ...last, reasoning: chatAssistantRef.current.reasoning };
              return arr;
            }
            return [...prev, { role: 'assistant', content: '', reasoning: chatAssistantRef.current.reasoning }];
          });
        } else if (parsed.type === 'message_end') {
          setIsChatStreaming(false);
          chatStreamRef.current = null;
          chatAssistantRef.current = { content: '', reasoning: '' };
        } else if (parsed.type === 'error') {
          const d = JSON.parse(parsed.data);
          setChatMessages(prev => [...prev, { role: 'assistant', content: `错误: ${d.message}` }]);
          setIsChatStreaming(false);
        }
      } catch (err) {
        console.error('Chat stream parse error:', err);
      }
    });

    client.addEventListener('error', () => {
      setIsChatStreaming(false);
      chatStreamRef.current = null;
    });
  };

  if (!subject) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text>科目不存在</Text>
        <br />
        <Button type="link" onClick={() => navigate('/')}>返回首页</Button>
      </div>
    );
  }

  const midWidth = 1 - leftWidth - rightWidth;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: colors.bg }}>
      {/* ===== 顶部栏 ===== */}
      <header
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          borderBottom: `1px solid ${colors.stroke}`,
          background: colors.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.9)',
          flexShrink: 0,
        }}
      >
        <Tooltip title="返回首页">
          <Button type="text" size="small" icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')} style={{ color: colors.muted }} />
        </Tooltip>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{subject.icon}</span>
          <span style={{ fontWeight: 700, color: colors.text, fontSize: 14 }}>{subject.name} 训练</span>
        </div>

        <div style={{ width: 1, height: 20, background: colors.stroke, margin: '0 4px' }} />

        {/* 难度选择 */}
        <Select size="small" value={difficulty} onChange={setDifficulty} style={{ width: 80 }}
          options={[
            { label: '简单', value: 'easy' },
            { label: '中等', value: 'medium' },
            { label: '困难', value: 'hard' },
          ]}
        />

        {/* 主题输入 */}
        <Input size="small" placeholder="指定主题（可选）" value={topic} onChange={e => setTopic(e.target.value)}
          style={{ width: 160 }} allowClear />

        {/* 生成题目按钮 */}
        <Button type="primary" size="small" icon={isGenerating ? <LoadingOutlined /> : <ReloadOutlined />}
          onClick={handleGenerate} loading={isGenerating}>
          {isGenerating ? '生成中' : '生成题目'}
        </Button>

        <div style={{ flex: 1 }} />

        {currentExercise && (
          <Tag color={currentExercise.difficulty === 'easy' ? 'green' : currentExercise.difficulty === 'medium' ? 'orange' : 'red'}>
            {currentExercise.title}
          </Tag>
        )}

        <Tooltip title={colors.isDark ? '亮色模式' : '暗色模式'}>
          <Button type="text" size="small"
            icon={colors.isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme} style={{ color: colors.muted }} />
        </Tooltip>
      </header>

      {/* ===== 三栏主体 ===== */}
      <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ---- 左侧：题目描述 ---- */}
        <section style={{ width: `${leftWidth * 100}%`, height: '100%', overflow: 'hidden', borderRight: `1px solid ${colors.stroke}` }}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: colors.subtleBg }}>
            <div style={{
              padding: '10px 14px', borderBottom: `1px solid ${colors.stroke}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: colors.isDark ? 'rgba(255,255,255,0.02)' : '#fff',
            }}>
              <span style={{ fontWeight: 650, fontSize: 13, color: colors.text }}>题目描述</span>
              {currentExercise && (
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: currentExercise.difficulty === 'easy' ? 'rgba(34,197,94,0.15)' : currentExercise.difficulty === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                  color: currentExercise.difficulty === 'easy' ? colors.good : currentExercise.difficulty === 'medium' ? colors.warn : '#ef4444',
                }}>
                  {currentExercise.difficulty === 'easy' ? '简单' : currentExercise.difficulty === 'medium' ? '中等' : '困难'}
                </span>
              )}
            </div>
            <div ref={descPanelRef} style={{ flex: 1, overflow: 'auto', padding: 14 }}>
              {isGenerating ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Spin size="small" />
                    <Text type="secondary" style={{ fontSize: 13 }}>AI 正在出题...</Text>
                  </div>
                  {generateProgress && (
                    <div style={{ fontSize: 12, color: colors.muted, opacity: 0.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {generateProgress}
                    </div>
                  )}
                </div>
              ) : currentExercise ? (
                <div className="markdown-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{fixMarkdownTables(currentExercise.detail)}</ReactMarkdown>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.muted }}>
                  <ReloadOutlined style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }} />
                  <div style={{ fontSize: 14, marginBottom: 8 }}>点击顶部「生成题目」开始</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>AI 会根据难度和主题为你量身出题</div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 左拖拽条 */}
        <div onMouseDown={() => handleMouseDown('left')} style={{ width: 6, cursor: 'col-resize', position: 'relative', zIndex: 5, flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: 36, transform: 'translate(-50%,-50%)', borderRadius: 999, background: colors.isDark ? 'rgba(255,255,255,0.15)' : '#d9d9d9' }} />
        </div>

        {/* ---- 中间：代码编辑器 + 终端 ---- */}
        <section id="mid-panel" style={{ width: `${midWidth * 100}%`, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: colors.panel }}>
          {/* 编辑器工具栏 */}
          <div style={{
            padding: '8px 14px', borderBottom: `1px solid ${colors.stroke}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: colors.isDark ? 'rgba(255,255,255,0.02)' : '#fff', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: 999, background: colors.good, boxShadow: '0 0 10px rgba(34,197,94,0.3)' }} />
              <span style={{ fontSize: 12, color: colors.muted }}>answer.{currentExercise?.language || language}</span>
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, border: `1px solid ${colors.stroke}`, color: colors.muted }}>
                {currentExercise?.language || language}
              </span>
            </div>
            <Space size={6}>
              {currentExercise?.hints && currentExercise.hints.length > 0 && (
                <Tooltip title="插入提示">
                  <Button type="text" size="small" icon={<BulbOutlined />} style={{ color: colors.warn }}
                    onClick={() => {
                      const hint = currentExercise.hints.map((h, i) => `# 提示${i + 1}: ${h}`).join('\n');
                      setCode(prev => prev + '\n\n' + hint);
                    }} />
                </Tooltip>
              )}
              <Button type="primary" size="small" icon={isJudging ? <LoadingOutlined /> : <CaretRightOutlined />}
                onClick={handleRun} loading={isJudging} disabled={!currentExercise}>
                {isJudging ? '评判中' : '运行'}
              </Button>
            </Space>
          </div>

          {/* 代码编辑区 - CodeMirror */}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 120 }}>
            <CodeEditor
              value={code}
              onChange={setCode}
              language={currentExercise?.language || language}
              isDark={colors.isDark}
            />
          </div>

          {/* 底部拖拽条 — 始终可见，收起时当作把手从底部拉出 */}
          <div
            onMouseDown={() => handleMouseDown('midH')}
            style={{
              height: outputHeight > 0 ? 6 : 24,
              cursor: 'row-resize',
              position: 'relative',
              zIndex: 6,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: outputHeight > 0
                ? 'transparent'
                : (colors.isDark ? 'rgba(255,255,255,0.04)' : '#f0f0f0'),
              borderTop: outputHeight > 0 ? 'none' : `1px solid ${colors.stroke}`,
              transition: 'height 0.15s, background 0.15s',
            }}
          >
            {outputHeight > 0 ? (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 36, height: 2, transform: 'translate(-50%,-50%)',
                borderRadius: 999,
                background: colors.isDark ? 'rgba(255,255,255,0.15)' : '#d9d9d9',
              }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 36, height: 3, borderRadius: 999,
                  background: colors.isDark ? 'rgba(255,255,255,0.2)' : '#bbb',
                }} />
                <span style={{ fontSize: 11, color: colors.muted }}>拖拽展开评判结果</span>
                <div style={{
                  width: 36, height: 3, borderRadius: 999,
                  background: colors.isDark ? 'rgba(255,255,255,0.2)' : '#bbb',
                }} />
              </div>
            )}
          </div>

          {/* 终端输出区 — 高度为 0 时完全隐藏 */}
          {outputHeight > 0 && (
            <div style={{ height: outputHeight, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{
                padding: '6px 14px', borderTop: `1px solid ${colors.stroke}`, borderBottom: `1px solid ${colors.stroke}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: colors.isDark ? 'rgba(255,255,255,0.02)' : '#fff', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 999, background: colors.warn, boxShadow: '0 0 10px rgba(245,158,11,0.25)' }} />
                  <span style={{ fontSize: 12, color: colors.muted }}>评判结果</span>
                  {output.some(l => l.text.includes('✅')) && (
                    <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0, fontSize: 11 }}>通过</Tag>
                  )}
                  {output.some(l => l.text.includes('❌')) && (
                    <Tag icon={<CloseCircleOutlined />} color="error" style={{ margin: 0, fontSize: 11 }}>未通过</Tag>
                  )}
                </div>
                <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => setOutputHeight(0)} style={{ color: colors.muted }} />
              </div>
              <div style={{
                flex: 1, overflow: 'auto', padding: 12,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 12.5, lineHeight: 1.65, background: colors.codeBg,
              }}>
                {isJudging && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Spin size="small" />
                    <span style={{ color: colors.muted, fontSize: 12 }}>AI 评判官正在分析代码...</span>
                  </div>
                )}
                {output.map((line, i) => (
                  <div key={i} style={{
                    color: line.type === 'ok' ? colors.good : line.type === 'error' ? '#ef4444' : line.type === 'warn' ? colors.warn : colors.isDark ? 'rgba(255,255,255,0.78)' : '#555',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {line.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 右拖拽条 */}
        <div onMouseDown={() => handleMouseDown('right')} style={{ width: 6, cursor: 'col-resize', position: 'relative', zIndex: 5, flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: 36, transform: 'translate(-50%,-50%)', borderRadius: 999, background: colors.isDark ? 'rgba(255,255,255,0.15)' : '#d9d9d9' }} />
        </div>

        {/* ---- 右侧：AI 对话 ---- */}
        <section style={{ width: `${rightWidth * 100}%`, height: '100%', overflow: 'hidden', borderLeft: `1px solid ${colors.stroke}` }}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: colors.panel2 }}>
            {/* 对话头 */}
            <div style={{
              padding: '10px 14px', borderBottom: `1px solid ${colors.stroke}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: colors.isDark ? 'rgba(255,255,255,0.02)' : '#fff', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RobotOutlined style={{ color: colors.accent }} />
                <span style={{ fontWeight: 650, fontSize: 13, color: colors.text }}>AI 助手</span>
              </div>
              <Space size={4}>
                <Tooltip title={includeContext ? '当前会携带题目和代码作为上下文发送给 AI' : '当前不携带上下文，AI 仅看到你的问题'}>
                  <Switch size="small" checked={includeContext} onChange={setIncludeContext}
                    checkedChildren="上下文" unCheckedChildren="无上下文" />
                </Tooltip>
                <Tooltip title="清空对话">
                  <Button type="text" size="small" icon={<ClearOutlined />}
                    onClick={() => setChatMessages([])} style={{ color: colors.muted }} />
                </Tooltip>
              </Space>
            </div>

            {/* 对话流 */}
            <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: colors.muted, fontSize: 13 }}>
                  <RobotOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} />
                  <div>遇到不懂的，直接问 AI</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                    开启「上下文」后，AI 能看到当前题目和你的代码
                  </div>
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
                  {msg.reasoning && (
                    <div style={{
                      marginBottom: 6, padding: '4px 8px', borderRadius: 6,
                      background: colors.isDark ? 'rgba(255,255,255,0.05)' : '#fafafa',
                      border: `1px dashed ${colors.stroke}`, fontSize: 12, color: colors.muted,
                    }}>
                      💭 {msg.reasoning.length > 200 ? msg.reasoning.slice(0, 200) + '...' : msg.reasoning}
                    </div>
                  )}
                  {msg.role === 'assistant' ? (
                    <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  )}
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
                placeholder={includeContext ? '问 AI（携带题目+代码上下文）...' : '问 AI...'}
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
      </div>
    </div>
  );
};

export default TrainingPage;
