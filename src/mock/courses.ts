import type { Subject, Chapter } from '../types/course';

// ==================== 科目列表 ====================
export const subjects: Subject[] = [
  // ===== 编程语言 =====
  {
    id: 'shell',
    name: 'Shell',
    icon: '🐚',
    desc: '学习 Bash/Shell 命令行操作，掌握文本处理、管道、脚本编写等核心技能',
    color: '#52c41a',
  },
  {
    id: 'go',
    name: 'Go',
    icon: '🐹',
    desc: '学习 Go 语言基础与进阶，涵盖并发编程、接口设计、项目实战',
    color: '#00ADD8',
  },
  {
    id: 'python',
    name: 'Python',
    icon: '🐍',
    desc: '学习 Python 编程基础、数据处理、Web 开发等实用技能',
    color: '#3776AB',
  },
  {
    id: 'java',
    name: 'Java',
    icon: '☕',
    desc: '学习 Java 面向对象编程、集合框架、多线程、Spring 生态',
    color: '#ED8B00',
  },
  {
    id: 'cpp',
    name: 'C++',
    icon: '⚡',
    desc: '学习 C++ 语言特性、内存管理、STL、模板编程等',
    color: '#00599C',
  },
  {
    id: 'rust',
    name: 'Rust',
    icon: '🦀',
    desc: '学习 Rust 所有权系统、生命周期、并发安全、零成本抽象',
    color: '#CE422B',
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    icon: '🔷',
    desc: '学习 TypeScript 类型系统、泛型、装饰器、Node.js 后端开发',
    color: '#3178C6',
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    icon: '✨',
    desc: '学习 JS 核心概念：闭包、原型链、异步编程、ES6+ 新特性',
    color: '#F7DF1E',
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    icon: '🎯',
    desc: '学习 Kotlin 语法糖、协程、空安全、函数式编程等特性',
    color: '#7F52FF',
  },
  // ===== 数据库 =====
  {
    id: 'mysql',
    name: 'MySQL',
    icon: '🗄️',
    desc: '学习 SQL 查询、数据库设计、索引优化、事务等核心知识',
    color: '#4479A1',
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    icon: '🐘',
    desc: '学习 PostgreSQL 高级 SQL、窗口函数、JSONB、CTE、性能调优',
    color: '#336791',
  },
  {
    id: 'redis',
    name: 'Redis',
    icon: '🔴',
    desc: '学习 Redis 数据结构、缓存策略、持久化、分布式锁等',
    color: '#DC382D',
  },
  // ===== 基础设施与工具 =====
  {
    id: 'linux',
    name: 'Linux',
    icon: '🐧',
    desc: '学习 Linux 系统管理、文件权限、进程管理、网络配置',
    color: '#FCC624',
  },
  {
    id: 'git',
    name: 'Git',
    icon: '🌿',
    desc: '学习 Git 版本控制、分支策略、合并冲突解决、工作流',
    color: '#F05032',
  },
  {
    id: 'docker',
    name: 'Docker',
    icon: '🐳',
    desc: '学习 Docker 容器化、Dockerfile 编写、Compose 编排、镜像优化',
    color: '#2496ED',
  },
  {
    id: 'nginx',
    name: 'Nginx',
    icon: '🔧',
    desc: '学习 Nginx 配置、反向代理、负载均衡、HTTPS、性能调优',
    color: '#009639',
  },
  // ===== 计算机基础 =====
  {
    id: 'regex',
    name: '正则表达式',
    icon: '🔍',
    desc: '学习正则表达式语法、贪婪/懒惰匹配、分组捕获、常用模式',
    color: '#8B5CF6',
  },
  {
    id: 'htmlcss',
    name: 'HTML/CSS',
    icon: '🎨',
    desc: '学习 HTML5 语义化、CSS3 布局（Flex/Grid）、响应式设计',
    color: '#E34F26',
  },
  {
    id: 'network',
    name: 'HTTP/网络',
    icon: '🌐',
    desc: '学习 HTTP 协议、TCP/IP、DNS、HTTPS、WebSocket、网络调试',
    color: '#0EA5E9',
  },
  {
    id: 'algorithm',
    name: '数据结构与算法',
    icon: '🧮',
    desc: '学习数组、链表、树、图、排序、搜索、动态规划等核心算法',
    color: '#EC4899',
  },
];

// ==================== Shell 练习题 ====================
const shellExercises: Chapter[] = [
  {
    id: 'shell-ch1',
    subjectId: 'shell',
    title: '文本检索与统计',
    exercises: [
      {
        id: 'shell-ex-001',
        subjectId: 'shell',
        title: 'grep + wc + sort 综合练习',
        difficulty: 'easy',
        language: 'bash',
        desc: '使用管道组合 grep、wc、sort 命令，完成日志文件的检索与统计',
        detail: `## 题目：日志分析 — grep / wc / sort

### 背景
假设当前目录下有一个日志文件 \`app.log\`，其中每行以 **ERROR**、**WARN** 或 **INFO** 开头。

### 你需要学会的命令

| 命令 | 说明 |
|------|------|
| \`grep -n "ERROR" app.log\` | 输出匹配行并带行号 |
| \`grep -c "ERROR" app.log\` | 只输出匹配行的数量 |
| \`wc -l app.log\` | 统计文件总行数 |
| \`sort -nr counts.txt\` | 按数字倒序排序 |
| \`|\` (管道) | 将前一个命令的输出作为后一个命令的输入 |

### 任务要求

1. 找出 \`app.log\` 中包含 **"ERROR"** 的所有行
2. 输出 ERROR 出现的总行数（只要数字）
3. 统计三种级别（ERROR / WARN / INFO）的行数，按出现次数从高到低排序输出

### 输出示例

\`\`\`
ERROR_COUNT=12
ERROR 12
WARN  7
INFO  3
\`\`\`

> 提示：你可以用 \`awk\` 提取关键词，配合 \`sort\` + \`uniq -c\` 做分组统计。`,
        hints: [
          '统计 ERROR 行数可以用 grep -c "ERROR" app.log',
          '管道组合示例：grep -E "ERROR|WARN|INFO" app.log | awk \'{print $1}\' | sort | uniq -c | sort -nr',
        ],
        initialCode: `# =========================
# 题目简述
# - 输入：当前目录下的 app.log
# - 要求：
#   1) 统计 "ERROR" 出现的总行数
#   2) 统计三种级别的行数，按次数从大到小排序输出
# =========================

# 在下方写你的命令：
`,
        expectedOutput: `ERROR_COUNT=12
ERROR 12
WARN  7
INFO  3`,
      },
      {
        id: 'shell-ex-002',
        subjectId: 'shell',
        title: 'find + xargs 文件搜索',
        difficulty: 'medium',
        language: 'bash',
        desc: '使用 find 和 xargs 组合进行文件搜索和批量操作',
        detail: `## 题目：文件搜索与批量操作 — find / xargs

### 背景
在项目目录中，你需要找到特定类型的文件并进行批量操作。

### 核心命令

| 命令 | 说明 |
|------|------|
| \`find . -name "*.log"\` | 查找当前目录下所有 .log 文件 |
| \`find . -mtime -7\` | 查找最近 7 天修改的文件 |
| \`find . -size +1M\` | 查找大于 1MB 的文件 |
| \`xargs\` | 将标准输入转为命令参数 |

### 任务要求

1. 找出当前目录及子目录下所有 \`.log\` 文件
2. 找出其中大于 100KB 的文件，按大小排序
3. 统计这些文件的总行数

### 输出示例

\`\`\`
./logs/app.log
./logs/error.log
./data/access.log
Total: 3 files, 15420 lines
\`\`\``,
        hints: [
          'find . -name "*.log" -size +100k',
          'find 的结果可以通过 | xargs wc -l 统计行数',
        ],
        initialCode: `# =========================
# 题目简述
# - 找出所有 .log 文件
# - 筛选大于 100KB 的
# - 统计总行数
# =========================

# 在下方写你的命令：
`,
      },
    ],
  },
  {
    id: 'shell-ch2',
    subjectId: 'shell',
    title: 'sed 与 awk 文本处理',
    exercises: [
      {
        id: 'shell-ex-003',
        subjectId: 'shell',
        title: 'awk 分组统计',
        difficulty: 'medium',
        language: 'bash',
        desc: '使用 awk 对 CSV 数据进行分组统计和格式化输出',
        detail: `## 题目：CSV 数据分析 — awk

### 背景
有一个 \`sales.csv\` 文件，格式为：\`日期,部门,销售额\`

\`\`\`
2025-01-01,技术部,15000
2025-01-01,市场部,8000
2025-01-02,技术部,12000
2025-01-02,市场部,9500
2025-01-02,运营部,6000
\`\`\`

### 任务要求

1. 按**部门**统计总销售额
2. 输出格式：\`部门名称 总额\`，按总额从大到小排序
3. 在最后一行输出所有部门的总计

### 输出示例

\`\`\`
技术部 27000
市场部 17500
运营部 6000
---
总计 50500
\`\`\``,
        hints: [
          '使用 awk -F"," 指定逗号为分隔符',
          'awk 中可以用关联数组做分组：sum[$2]+=$3',
          'END{} 块中输出汇总结果',
        ],
        initialCode: `# =========================
# 题目简述
# - 输入：sales.csv（逗号分隔）
# - 按部门统计总销售额，排序输出
# =========================

# 在下方写你的命令：
`,
      },
    ],
  },
];

// ==================== Go 练习题 ====================
const goExercises: Chapter[] = [
  {
    id: 'go-ch1',
    subjectId: 'go',
    title: 'Slice 基础与进阶',
    exercises: [
      {
        id: 'go-ex-001',
        subjectId: 'go',
        title: 'Slice 扩容机制',
        difficulty: 'medium',
        language: 'go',
        desc: '理解 Go Slice 的底层结构和扩容规则，编写代码验证',
        detail: `## 题目：验证 Slice 扩容机制

### 背景
Go 的 slice 底层是一个包含 \`指针\`、\`长度\`、\`容量\` 的结构体。当 append 导致容量不够时，Go 会分配新的底层数组。

### 任务要求

编写一个 Go 程序：
1. 创建一个空 slice
2. 循环 append 元素（1 到 20）
3. **每次 append 后**，打印当前的 \`len\`、\`cap\` 和底层数组指针
4. 观察容量何时发生变化

### 输出示例

\`\`\`
append 1:  len=1  cap=1  ptr=0xc0000b2008
append 2:  len=2  cap=2  ptr=0xc0000b2030
append 3:  len=3  cap=4  ptr=0xc0000b8020
...
\`\`\`

> 提示：使用 \`fmt.Printf\` 和 \`%p\` 格式化指针，\`&s[0]\` 获取底层数组指针。`,
        hints: [
          '用 unsafe.Pointer 或 &s[0] 获取底层数组地址',
          '扩容规则：len < 256 时翻倍，超过后按约 1.25 倍增长',
        ],
        initialCode: `package main

import "fmt"

func main() {
	var s []int

	for i := 1; i <= 20; i++ {
		s = append(s, i)
		// TODO: 打印 len, cap 和底层数组指针
		fmt.Printf("append %2d: len=%-3d cap=%-3d\\n", i, len(s), cap(s))
	}
}
`,
      },
    ],
  },
];

// ==================== MySQL 练习题 ====================
const mysqlExercises: Chapter[] = [
  {
    id: 'mysql-ch1',
    subjectId: 'mysql',
    title: '基础查询与聚合',
    exercises: [
      {
        id: 'mysql-ex-001',
        subjectId: 'mysql',
        title: 'GROUP BY 与 HAVING',
        difficulty: 'easy',
        language: 'sql',
        desc: '使用 GROUP BY 和 HAVING 进行分组统计与条件过滤',
        detail: `## 题目：员工薪资统计

### 背景
有一张 \`employees\` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| name | VARCHAR | 姓名 |
| department | VARCHAR | 部门 |
| salary | DECIMAL | 薪资 |
| hire_date | DATE | 入职日期 |

### 任务要求

1. 查询每个部门的**平均薪资**和**人数**
2. 只显示人数 >= 3 的部门
3. 按平均薪资从高到低排序

### 输出示例

\`\`\`
+-----------+----------+-------+
| department| avg_sal  | count |
+-----------+----------+-------+
| 技术部    | 18500.00 | 5     |
| 市场部    | 15000.00 | 4     |
| 运营部    | 12000.00 | 3     |
+-----------+----------+-------+
\`\`\``,
        hints: [
          'GROUP BY department',
          'HAVING COUNT(*) >= 3',
          'ORDER BY avg_sal DESC',
        ],
        initialCode: `-- 查询每个部门的平均薪资和人数
-- 只显示人数 >= 3 的部门
-- 按平均薪资从高到低排序

SELECT
  department,
  -- TODO: 补全查询
FROM employees
`,
      },
    ],
  },
];

// ==================== 导出 ====================
export const allChapters: Record<string, Chapter[]> = {
  shell: shellExercises,
  go: goExercises,
  mysql: mysqlExercises,
  python: [],
  java: [],
  cpp: [],
  rust: [],
  typescript: [],
  javascript: [],
  kotlin: [],
  postgresql: [],
  redis: [],
  linux: [],
  git: [],
  docker: [],
  nginx: [],
  regex: [],
  htmlcss: [],
  network: [],
  algorithm: [],
};

// 获取科目下的所有章节
export const getChaptersBySubject = (subjectId: string): Chapter[] => {
  return allChapters[subjectId] || [];
};

// 获取特定练习题
export const getExerciseById = (exerciseId: string): Exercise | undefined => {
  for (const chapters of Object.values(allChapters)) {
    for (const chapter of chapters) {
      const found = chapter.exercises.find(e => e.id === exerciseId);
      if (found) return found;
    }
  }
  return undefined;
};
