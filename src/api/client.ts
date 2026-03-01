import axios from 'axios';
import { safeMessage } from '../utils/messageApi';

const client = axios.create({
  baseURL: '',
  timeout: 1200000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：自动附加 Token
client.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers = config.headers || {};
        (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // 忽略本地存储读取异常
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
client.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res.code === 0) {
      return res.data;
    } else {
      safeMessage.error(res.message || '请求失败');
      return Promise.reject(new Error(res.message));
    }
  },
  (error) => {
    const msg = error.response?.data?.message || error.message || '请求失败';
    safeMessage.error(msg);
    return Promise.reject(error);
  }
);

export default client;
