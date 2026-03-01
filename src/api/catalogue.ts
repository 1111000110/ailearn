/**
 * 目录服务 API
 *
 * 对应后端 community-service-post-api 中的 Catalogue 模块。
 * 目录采用递归树形结构：根目录 → 章节 → 小节。
 * 每个小节可通过 post_id 绑定一篇帖子（文章）。
 *
 * 注意：后端 int64 字段加了 json:",string"，所有 ID 字段在 JSON 中为字符串类型。
 */

import client from './client';

// ==================== 类型定义 ====================

/** 目录基本信息（与后端 CatalogueDetail 一一对应） */
export interface CatalogueDetail {
  user_id: string;              // 创作者 ID
  catalogue_id: string;         // 目录 ID
  title: string;                // 标题
  desc: string;                 // 描述
  post_id: string;              // 绑定的帖子 ID（"0" 表示未绑定）
  level: number;                // 级别（0=根, 1=章, 2=节）
  root_catalogue_id: string;    // 根目录 ID
  parent_catalogue_id: string;  // 父目录 ID
}

/** 递归目录树节点 */
export interface CatalogueStruct {
  catalogue: CatalogueDetail | null;
  is_have_sub: boolean;                 // 是否还有子节点
  catalogue_struct: CatalogueStruct[];  // 子节点列表
}

/** 创建目录时的递归结构 */
export interface CatalogueCreateStruct {
  user_id: string;
  title: string;
  desc: string;
  post_id: string;                                 // 初始都传 "0"
  parent_catalogue_id: string;                     // 根目录传 "0"，子节点由服务端自动填充
  catalogue_create_sub: CatalogueCreateStruct[];   // 子节点
}

// ---- 请求 / 响应 ----

export interface CatalogueRootListReq {
  offset: number;
  limit: number;
}
export interface CatalogueRootListResp {
  catalogue_struct_list: CatalogueStruct[];
}

export interface CatalogueDetailReq {
  catalogue_id: string;
}
export interface CatalogueDetailResp {
  catalogue_struct: CatalogueStruct;
}

export interface CatalogueCreateReq {
  catalogue_create_struct: CatalogueCreateStruct;
}
export interface CatalogueCreateResp {
  catalogue_id: string;
}

export interface CatalogueUpdateReq {
  catalogue_detail: CatalogueDetail;  // 更新后的完整信息
  catalogue_id: string;               // 要更新的目录 ID
  update_field: string[];             // 指定更新哪些字段，如 ["post_id"]
}
export type CatalogueUpdateResp = object;

// ==================== API 函数 ====================

/**
 * 获取根目录列表（不需要登录）
 * 首页调用，展示所有可学习的模块
 */
export const getCatalogueRootList = (
  data: CatalogueRootListReq,
): Promise<CatalogueRootListResp> => {
  return client.post('/api/catalogue/root/list', data);
};

/**
 * 获取目录详情（递归树）（不需要登录）
 * 教学页进入时调用，获取完整的章节 → 小节结构
 */
export const getCatalogueDetail = (
  data: CatalogueDetailReq,
): Promise<CatalogueDetailResp> => {
  return client.post('/api/catalogue/detail', data);
};

/**
 * 创建目录（需要登录）
 * 用户新建学习模块时调用，提交 AI 生成的递归目录结构
 */
export const createCatalogue = (
  data: CatalogueCreateReq,
): Promise<CatalogueCreateResp> => {
  return client.post('/api/catalogue/create', data);
};

/**
 * 更新目录（需要登录）
 * 用于将 AI 生成的文章（post）绑定到目录节点上
 */
export const updateCatalogue = (
  data: CatalogueUpdateReq,
): Promise<CatalogueUpdateResp> => {
  return client.post('/api/catalogue/update', data);
};
