import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Tooltip } from 'antd';
import {
  SunOutlined,
  MoonOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useTheme } from '../../contexts/ThemeContext';
import { subjects } from '../../config/subjects';

const { Title, Paragraph } = Typography;

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSelect = (subjectId: string) => {
    navigate(`/training/${subjectId}`);
  };

  return (
    <div
      style={{
        height: '100%',
        background: isDark
          ? 'radial-gradient(1200px 600px at 30% 10%, rgba(110, 231, 255, 0.06), transparent 55%), radial-gradient(900px 500px at 80% 30%, rgba(34, 197, 94, 0.04), transparent 55%), #0b1220'
          : 'linear-gradient(135deg, #f5f7fa 0%, #e4e9f0 100%)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {/* 顶部栏 */}
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: 'radial-gradient(circle at 30% 30%, #fff, #6ee7ff)',
              boxShadow: '0 0 18px rgba(110, 231, 255, 0.35)',
            }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a',
              letterSpacing: 0.2,
            }}
          >
            AILearn
          </span>
          <span
            style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 999,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#d9d9d9'}`,
              color: isDark ? 'rgba(255,255,255,0.5)' : '#999',
            }}
          >
            Beta
          </span>
        </div>
        <Tooltip title={isDark ? '切换到亮色模式' : '切换到暗色模式'}>
          <Button
            type="text"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
            style={{ color: isDark ? 'rgba(255,255,255,0.68)' : '#666' }}
          />
        </Tooltip>
      </header>

      {/* 主内容 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '40px 24px 60px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Title
            level={1}
            style={{
              margin: 0,
              fontSize: 36,
              color: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a',
              fontWeight: 800,
            }}
          >
            AI 辅助学习平台
          </Title>
          <Paragraph
            style={{
              marginTop: 12,
              fontSize: 16,
              color: isDark ? 'rgba(255,255,255,0.55)' : '#888',
              maxWidth: 480,
            }}
          >
            选择一个科目开始训练，像 LeetCode 一样刷题，遇到问题随时问 AI
          </Paragraph>
        </div>

        {/* 科目卡片网格 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
            maxWidth: 960,
            width: '100%',
          }}
        >
          {subjects.map((subject) => {
            const isHovered = hoveredId === subject.id;
            return (
              <div
                key={subject.id}
                onMouseEnter={() => setHoveredId(subject.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleSelect(subject.id)}
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: `1px solid ${
                    isHovered
                      ? isDark
                        ? 'rgba(110, 231, 255, 0.3)'
                        : subject.color
                      : isDark
                        ? 'rgba(255,255,255,0.10)'
                        : '#e8e8e8'
                  }`,
                  background: isDark
                    ? isHovered
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(255,255,255,0.02)'
                    : isHovered
                      ? '#fff'
                      : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  transform: isHovered ? 'translateY(-2px)' : 'none',
                  boxShadow:
                    isHovered
                      ? isDark
                        ? '0 8px 24px rgba(0,0,0,0.3)'
                        : '0 8px 24px rgba(0,0,0,0.08)'
                      : 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 28 }}>{subject.icon}</span>
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a',
                      }}
                    >
                      {subject.name}
                    </span>
                  </div>
                  <ArrowRightOutlined
                    style={{
                      color: isDark ? 'rgba(255,255,255,0.3)' : '#bbb',
                      opacity: isHovered ? 1 : 0,
                      transition: 'opacity 0.2s',
                    }}
                  />
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: isDark ? 'rgba(255,255,255,0.55)' : '#888',
                  }}
                >
                  {subject.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
