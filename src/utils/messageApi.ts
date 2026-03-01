/**
 * 消息 API 桥接工具
 *
 * 解决 antd 5 静态 message.xxx() 无法消费 ConfigProvider 上下文的问题。
 * 在根组件通过 App.useApp() 拿到 message 实例后注入到这里，
 * 非组件代码（如 api/client.ts）就可以安全地调用。
 */

import type { MessageInstance } from 'antd/es/message/interface';

let _message: MessageInstance | null = null;

export function setMessageApi(api: MessageInstance) {
  _message = api;
}

export function getMessageApi(): MessageInstance | null {
  return _message;
}

/**
 * 安全调用 message —— 如果桥接尚未初始化则静默跳过（不会抛异常）
 */
export const safeMessage = {
  success: (content: string) => _message?.success(content),
  error: (content: string) => _message?.error(content),
  warning: (content: string) => _message?.warning(content),
  info: (content: string) => _message?.info(content),
};
