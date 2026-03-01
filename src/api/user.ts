/**
 * 用户服务 API
 *
 * 注意：后端 int64 字段加了 json:",string"，所有 ID 字段在 JSON 中为字符串类型。
 */

import client from './client';

export interface LoginReq {
  phone: string;
  password: string;
  user_id?: string;  // 用户ID登录时传字符串
}

export interface LoginResp {
  token: string;
  user_id: string;
}

export interface RegisterReq {
  phone: string;
  password: string;
  role?: string;
}

export interface RegisterResp {
  user_id: string;
  token: string;
}

export interface UserBase {
  user_id: string;
  nick_name: string;
  avatar: string;
  gender: string;
  birth_date: number;
}

export interface UserPrivate {
  user_id: string;
  phone: string;
  email: string;
  password?: string;
  role: string;
  status: number;
}

export interface UserInfo {
  user_base: UserBase;
  user_private: UserPrivate;
}

export interface UserQueryReq {
  query_user_id?: string;
  type: string;
}
export interface UserQueryResp {
  user_info: UserInfo;
}

export interface UserUpdateReq {
  user_info: UserInfo;
  update_type?: string;
}
export type UserUpdateResp = object;

export const loginUser = (data: LoginReq): Promise<LoginResp> => {
  return client.post('/api/user/login', data);
};

export const registerUser = (data: RegisterReq): Promise<RegisterResp> => {
  return client.post('/api/user/register', { role: 'user', ...data });
};

export const getUserInfo = (data: UserQueryReq): Promise<UserQueryResp> => {
  return client.post('/api/user/query', data);
};

export const updateUserInfo = (data: UserUpdateReq): Promise<UserUpdateResp> => {
  return client.post('/api/user/update', data);
};
