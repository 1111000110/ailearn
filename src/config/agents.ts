// AILearn 专用 Agent 配置
// 这些 Agent 是通过 community 后端 API 创建的，ID 和 api_key 在此配置

export const AGENT_CONFIG = {
  // 题目生成器 Agent
  exerciseGenerator: {
    agent_id: 15,
    api_key: '$2a$10$U6rSVHuwyPN6ZEKrPhhMuOTbkKpUlyQCNJ82XLLWu2hpyZtXjqkDm',
    name: 'AILearn-题目生成器',
  },
  // 代码评判官 Agent
  codeJudge: {
    agent_id: 16,
    api_key: '$2a$10$j7X5twXAsFa6A4wyXAfMx.M2R77heBqXqUnfLzoT2HcBTHoBpoVVa',
    name: 'AILearn-代码评判官',
  },
  // 教学助手 Agent
  teachingAssistant: {
    agent_id: 17,
    api_key: '$2a$10$W02ez9WzdSxfcKtL.svgte172ObCYeOzpMtKfBAA25YWCsREWvcdO',
    name: 'AILearn-教学助手',
  },
} as const;

// 科目到语言的映射
export const SUBJECT_LANGUAGE_MAP: Record<string, string> = {
  shell: 'bash',
  go: 'go',
  python: 'python',
  mysql: 'sql',
  java: 'java',
  cpp: 'cpp',
  rust: 'rust',
  typescript: 'typescript',
  javascript: 'javascript',
  kotlin: 'kotlin',
  postgresql: 'sql',
  redis: 'bash',
  linux: 'bash',
  git: 'bash',
  docker: 'dockerfile',
  nginx: 'nginx',
  regex: 'javascript',
  htmlcss: 'html',
  network: 'bash',
  algorithm: 'python',
};

// 科目描述（用于 prompt）
export const SUBJECT_PROMPT_MAP: Record<string, string> = {
  shell: 'Shell/Bash 命令行，涵盖 grep/awk/sed/find/xargs/管道/脚本 等',
  go: 'Go 语言，涵盖 slice/map/goroutine/channel/interface/error处理/标准库 等',
  python: 'Python 编程，涵盖 列表推导/字典/文件处理/装饰器/类/标准库 等',
  mysql: 'MySQL/SQL，涵盖 SELECT/JOIN/GROUP BY/子查询/索引/事务 等',
  java: 'Java 编程，涵盖 集合框架/多线程/IO/Lambda/Stream API 等',
  cpp: 'C++ 编程，涵盖 指针/引用/STL/模板/内存管理/智能指针 等',
  rust: 'Rust 编程，涵盖 所有权/借用/生命周期/trait/枚举/模式匹配/错误处理/并发 等',
  typescript: 'TypeScript 编程，涵盖 类型系统/泛型/接口/联合类型/装饰器/Node.js后端 等',
  javascript: 'JavaScript 编程，涵盖 闭包/原型链/Promise/async-await/ES6+/DOM操作/事件循环 等',
  kotlin: 'Kotlin 编程，涵盖 空安全/数据类/密封类/协程/扩展函数/集合操作/函数式编程 等',
  postgresql: 'PostgreSQL 数据库，涵盖 窗口函数/CTE/JSONB操作/数组类型/全文搜索/索引优化/事务隔离 等',
  redis: 'Redis，涵盖 String/Hash/List/Set/ZSet数据结构/过期策略/持久化/发布订阅/分布式锁/Lua脚本 等',
  linux: 'Linux 系统管理，涵盖 文件权限/用户管理/进程管理/systemd/网络配置/磁盘管理/日志分析 等',
  git: 'Git 版本控制，涵盖 分支管理/合并策略/rebase/cherry-pick/冲突解决/Git hooks/工作流 等',
  docker: 'Docker 容器化，涵盖 Dockerfile编写/多阶段构建/docker-compose/网络/数据卷/镜像优化 等',
  nginx: 'Nginx 配置，涵盖 server块/location匹配/反向代理/负载均衡/HTTPS配置/缓存/限流 等',
  regex: '正则表达式，涵盖 字符类/量词/分组捕获/前后断言/贪婪与懒惰匹配/常用正则模式 等',
  htmlcss: 'HTML/CSS 前端基础，涵盖 语义化标签/Flexbox/Grid/响应式设计/CSS变量/动画/BFC 等',
  network: 'HTTP与网络协议，涵盖 HTTP方法/状态码/请求头/Cookie/Session/HTTPS/TCP三次握手/DNS解析/WebSocket 等',
  algorithm: '数据结构与算法，涵盖 数组/链表/栈/队列/树/图/排序/二分查找/动态规划/贪心/回溯/BFS/DFS 等',
};
