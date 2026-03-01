/**
 * 帖子（文章）服务 API
 *
 * 对应后端 community-service-post-api 中的 Post 模块。
 * 帖子是目录体系中的"内容载体"：
 * - 用户点击某个小节时，若该小节尚无文章 → AI 生成 → 调用 createPost 保存
 * - 后续访问同一小节时 → 直接 getPostDetail 获取已有文章
 *
 * 注意：后端 int64 字段加了 json:",string"，所有 ID 字段在 JSON 中为字符串类型。
 */

import client from './client';

// ==================== 类型定义 ====================

/** 帖子基本信息 */
export interface PostBase {
  post_id: string;
  user_id: string;
  title: string;
  content: string;      // Markdown 格式的文章内容
  images: string[];
  theme: string;        // 主题标签，如 "Go"、"Python"
  tags: string[];
  status: number;       // 0=草稿, 1=已发布
  create_time: number;
  update_time: number;
}

/** 帖子统计信息 */
export interface PostStats {
  post_id: string;
  like_count: number;
  share_count: number;
  view_count: number;
  collect_count: number;
}

/** 帖子作者信息 */
export interface PostAuthor {
  user_id: string;
  nick_name: string;
  avatar: string;
}

/** 帖子完整详情 */
export interface PostDetail {
  post_base: PostBase;
  post_stats: PostStats;
  author: PostAuthor;
  is_liked: boolean;
  is_collected: boolean;
}

// ---- 请求 / 响应 ----

export interface PostCreateReq {
  title: string;
  content: string;
  images: string[];
  theme: string;
  tags: string[];
  status: number;  // 1=已发布
}
export interface PostCreateResp {
  post_id: string;
}

export interface PostDetailReq {
  post_id: string;
}
export interface PostDetailResp {
  post: PostDetail | null;
}

// ==================== API 函数 ====================

/**
 * 创建帖子（需要登录）
 * AI 生成教学内容后，调用此接口持久化保存
 */
export const createPost = (data: PostCreateReq): Promise<PostCreateResp> => {
  return client.post('/api/post/create', data);
};

/**
 * 获取帖子详情（不需要登录）
 * 教学页加载已有文章内容时调用
 */
export const getPostDetail = (data: PostDetailReq): Promise<PostDetailResp> => {
  return client.post('/api/post/detail', data);
};
