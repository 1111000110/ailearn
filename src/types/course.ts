// 课程科目
export interface Subject {
  id: string;
  name: string;
  icon: string;
  desc: string;
  color: string;
}

// 练习难度
export type Difficulty = 'easy' | 'medium' | 'hard';

// 练习题
export interface Exercise {
  id: string;
  subjectId: string;
  title: string;
  difficulty: Difficulty;
  desc: string;           // 题目简述
  detail: string;         // 题目详情（Markdown）
  hints: string[];        // 提示列表
  initialCode: string;    // 初始代码模板
  expectedOutput?: string; // 预期输出示例
  language: string;       // 语言标识（bash, go, python, sql...）
}

// 课程章节
export interface Chapter {
  id: string;
  subjectId: string;
  title: string;
  exercises: Exercise[];
}

// 运行结果
export interface RunResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime?: number;
}
