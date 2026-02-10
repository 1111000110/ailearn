import React, { useRef, useEffect } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { kotlin as kotlinMode } from '@codemirror/legacy-modes/mode/clike';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { nginx as nginxMode } from '@codemirror/legacy-modes/mode/nginx';
import { http as httpMode } from '@codemirror/legacy-modes/mode/http';

// 根据语言标识返回对应的 CodeMirror 语言扩展
function getLanguageExtension(lang: string) {
  switch (lang) {
    case 'bash':
    case 'shell':
    case 'sh':
      return StreamLanguage.define(shell);
    case 'go':
    case 'golang':
      return go();
    case 'python':
    case 'py':
      return python();
    case 'sql':
    case 'mysql':
    case 'postgresql':
      return sql();
    case 'cpp':
    case 'c++':
    case 'c':
      return cpp();
    case 'java':
      return java();
    case 'javascript':
    case 'js':
    case 'typescript':
    case 'ts':
      return javascript({ typescript: lang === 'ts' || lang === 'typescript' });
    case 'rust':
    case 'rs':
      return rust();
    case 'html':
      return html();
    case 'css':
      return css();
    case 'kotlin':
    case 'kt':
      return StreamLanguage.define(kotlinMode);
    case 'dockerfile':
    case 'docker':
      return StreamLanguage.define(dockerFile);
    case 'nginx':
      return StreamLanguage.define(nginxMode);
    case 'http':
      return StreamLanguage.define(httpMode);
    default:
      return StreamLanguage.define(shell);
  }
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  isDark?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language,
  isDark = true,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 初始化编辑器
  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(language);

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      rectangularSelection(),
      crosshairCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      foldGutter(),
      highlightSelectionMatches(),
      history(),
      autocompletion(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      langExt,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const val = update.state.doc.toString();
          onChangeRef.current(val);
        }
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '13px',
        },
        '.cm-scroller': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          overflow: 'auto',
        },
        '.cm-gutters': {
          border: 'none',
          background: isDark ? '#0a1525' : '#f8f8f8',
        },
        '.cm-activeLineGutter': {
          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        },
        '.cm-activeLine': {
          background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
        },
        '.cm-cursor': {
          borderLeftColor: isDark ? '#6ee7ff' : '#1677ff',
        },
      }),
      EditorView.lineWrapping,
    ];

    if (isDark) {
      extensions.push(oneDark);
    }

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, isDark, readOnly]);

  // 外部 value 变化时同步（避免光标跳动）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (value !== currentValue) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    />
  );
};

export default CodeEditor;
