import client from './client';
import type {
  GetAgentListReq,
  GetAgentListResp,
  RunAgentReq,
  RunAgentResp,
  RunAgentStreamReq,
} from '../types/agent';

// 获取Agent列表
export const getAgentList = (data?: GetAgentListReq): Promise<GetAgentListResp> => {
  return client.post('/api/ai/agent/list', data || {});
};

// 运行Agent（非流式）
export const runAgent = (data: RunAgentReq): Promise<RunAgentResp> => {
  return client.post('/api/ai/agent/run', data);
};

// 流式运行Agent - 使用 fetch 实现 SSE
export interface StreamClient {
  addEventListener: (type: string, listener: (data: unknown) => void) => void;
  removeEventListener: (type: string, listener: (data: unknown) => void) => void;
  close: () => void;
}

export const runAgentStream = (data: RunAgentStreamReq): StreamClient => {
  const listeners: Record<string, ((data: unknown) => void)[]> = {};

  const addEventListener = (type: string, listener: (data: unknown) => void) => {
    if (!listeners[type]) {
      listeners[type] = [];
    }
    listeners[type].push(listener);
  };

  const removeEventListener = (type: string, listener: (data: unknown) => void) => {
    if (listeners[type]) {
      listeners[type] = listeners[type].filter(fn => fn !== listener);
    }
  };

  const controller = new AbortController();

  const fetchData = async () => {
    try {
      const response = await fetch(`${client.defaults.baseURL}/api/ai/agent/run/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) {
              const lines = buffer.split('\n');
              for (const line of lines) {
                if (line.trim().startsWith('data: ')) {
                  const dataStr = line.trim().substring(6).trim();
                  if (dataStr) {
                    try {
                      const parsedData = JSON.parse(dataStr);
                      listeners['message']?.forEach(listener => listener(parsedData));
                    } catch {
                      listeners['message']?.forEach(listener => listener(dataStr));
                    }
                  }
                }
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data: ')) {
              const dataStr = trimmedLine.substring(6).trim();
              if (dataStr) {
                try {
                  const parsedData = JSON.parse(dataStr);
                  if (parsedData.type === 'message_end') {
                    listeners['message']?.forEach(listener => listener(parsedData));
                    setTimeout(() => {
                      controller.abort();
                      listeners['close']?.forEach(listener => listener({}));
                    }, 100);
                    continue;
                  }
                  listeners['message']?.forEach(listener => listener(parsedData));
                } catch {
                  listeners['message']?.forEach(listener => listener(dataStr));
                }
              }
            } else if (trimmedLine.startsWith('event: ') && trimmedLine.includes('close')) {
              setTimeout(() => {
                controller.abort();
                listeners['close']?.forEach(listener => listener({}));
              }, 100);
            }
          }
          if (controller.signal.aborted) break;
        }
      } else {
        throw new Error(`Request failed with status: ${response.status}`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        listeners['error']?.forEach(listener => listener(error));
      }
    }
  };

  fetchData();

  return {
    addEventListener,
    removeEventListener,
    close: () => controller.abort(),
  };
};
