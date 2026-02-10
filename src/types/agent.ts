// LLM 信息
export interface LlmInfo {
  llm_id: number;
  llm_name: string;
  supplier_name: string;
  supplier_model_id: string;
}

// 知识库检索配置
export interface KBSearchConfig {
  knowledge_list?: string[];
  top_k?: number;
  score_threshold?: number;
}

// 联网搜索配置
export interface WebSearchConfig {
  top_k?: number;
  recency_days?: number;
  allow_domains?: string[];
  block_domains?: string[];
  max_calls_per_turn?: number;
}

// 工具配置
export interface ToolConfig {
  kb?: KBSearchConfig;
  web?: WebSearchConfig;
}

// Agent 聊天配置
export interface AgentChatConfig {
  llm_id: number;
  is_think?: boolean;
  reasoning_effort?: string;
  max_context_tokens?: number;
  max_think_tokens?: number;
  is_service_tier?: boolean;
  stop?: string[];
  response_format?: string;
  frequency_penalty?: number;
  presence_penalty?: number;
  temperature?: number;
  top_p?: number;
  system_prompt?: string;
  chat_type?: number;
  chat_round?: number;
  enable_tools?: string[];
  tool_config?: ToolConfig;
}

// Agent 详情
export interface AgentDetail {
  agent_id: number;
  api_key?: string;
  name: string;
  desc?: string;
  icon?: string;
  status: number;
  create_time: number;
  update_time: number;
  agent_chat_config: AgentChatConfig;
  llm_info?: LlmInfo;
}

// 消息工具调用
export interface MessageTool {
  tool_id: string;
  name: string;
  arguments: string;
}

// Agent 消息详情
export interface AgentMessageDetail {
  agent_id: number;
  agent_session_id: string;
  message_agent_session_id: string;
  agent_chat_id?: number;
  role: string;
  message_type: number;
  message_content: string;
  reasoning_content?: string;
  tool_call_id?: string;
  tool_calls?: MessageTool[];
}

// API 请求/响应类型
export interface GetAgentListReq {
  is_all?: boolean;
}

export interface GetAgentListResp {
  agent_list: {
    agent_detail: AgentDetail;
    llm_detail?: LlmInfo;
  }[];
}

export interface RunAgentReq {
  agent_id: number;
  api_key: string;
  agent_message: AgentMessageDetail;
  prompt_replacement?: Record<string, string>;
}

export interface RunAgentResp {
  agent_message: AgentMessageDetail;
}

export interface RunAgentStreamReq {
  agent_id: number;
  api_key: string;
  agent_message: AgentMessageDetail;
  prompt_replacement?: Record<string, string>;
}

export interface RunAgentStreamResp {
  type: string;
  data: string;
}
