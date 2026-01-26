
export interface ChannelConfig {
  id: string;
  name: string;
  niche: string;
  concept?: string;
  auth: any | null;
  status: 'idle' | 'running' | 'success' | 'error';
  lastLog?: string;
  step?: number;
  language?: 'zh-TW' | 'en';
  searchKeywords?: string[];
  regionCode?: string;
  
  // 角色驅動模式專用
  mode?: 'classic' | 'character';
  characterProfile?: CharacterProfile;
  targetVibeId?: string;
  
  // 排程系統
  autoDeploy: boolean;
  weeklySchedule?: {
    days: number[]; // 0-6 (Sun-Sat)
    times: string[]; // ["HH:mm"]
  };
  lastRun?: string;
  lastTriggeredSlot?: string;

  // V9: Agent Memory System
  agentMemory?: AgentMemory;
}

export interface CharacterProfile {
  id: string;
  name: string;
  // 基本資料
  age?: string;          // e.g. "19 years old"
  occupation?: string;   // e.g. "College Student / Barista"
  gender?: string;       // e.g. "Female"
  
  // 行為模式
  personality: string;   // 詳細性格 e.g. "Energetic, clumsy, loves cats"
  voiceTone: string;     // 語氣 e.g. "Sarcastic, rapid-fire, Gen-Z slang"
  contentFocus: string;  // 專攻領域 e.g. "Tech reviews, Gaming, Vlogs"
  constraints: string;   // 禁忌/限制 e.g. "No alcohol, no swearing, keep face visible"

  description: string;   // 舊欄位保留作為 "視覺總結 (Visual Summary)"

  // 視覺資產
  images: {
    threeView?: string; // ★★★ 關鍵：三視圖 (Front/Side/Back)
    front?: string;     // Face Detail
    fullBody?: string;  // Outfit Detail
    side?: string;      // Structure Detail
  };
}

// V9: AI 的長期記憶庫
export interface AgentMemory {
  history: VideoLog[];
  strategy_bias: {
    // AI 對不同類型的偏好權重 (根據成效自動調整)
    dance: number;
    vlog: number;
    skit: number;
    challenge: number;
  };
}

// V9: 單次影片的決策記錄
export interface VideoLog {
  videoId: string;
  timestamp: string;
  topic: string;
  category: string;
  reasoning: string; // AI 為什麼決定拍這個？
  performance_mock?: { // 模擬成效 (未來接真實 API)
    views: number;
    retention: number; 
  };
}

export interface PipelineMetadata {
  prompt: string;
  title: string;
  desc: string;
}

export interface ShortsData {
  id: string;
  title: string;
  hashtags: string[];
  view_count: number;
  region?: string;
  view_growth_rate: number;
  publishedAt?: string;
}

export interface ChannelState {
  niche: string;
  avg_views: number;
  target_audience: string;
}

export interface TrendSignals {
  action_verb_frequency: Record<string, number>;
  subject_type_frequency: Record<string, number>;
  object_type_frequency: Record<string, number>;
  structure_type_frequency: Record<string, number>;
  algorithm_signal_frequency: Record<string, number>;
}

export interface IModule<TInput, TOutput> {
  name: string;
  description: string;
  execute(input: TInput): Promise<TOutput>;
}

export interface CandidateTheme {
  id: string;
  subject_type: string;
  action_verb: string;
  object_type: string;
  structure_type: string;
  algorithm_signals: string[];
  rationale?: string;
  total_score: number;
  selected: boolean;
  scoring_breakdown?: {
    virality: number;
    feasibility: number;
    trend_alignment: number;
  };
}

export interface PromptOutput {
  candidate_id: string;
  prompt: string;
  title_template: string;
  description_template: string;
  candidate_reference: CandidateTheme;
}

export interface TestResult {
  moduleName: string;
  passed: boolean;
  logs: string[];
}

export interface VideoAsset {
  candidate_id: string;
  video_url: string;
  mime_type: string;
  status: 'generated' | 'failed' | 'idle';
  generated_at: string;
}

export interface UploaderInput {
  video_asset: VideoAsset;
  metadata: PromptOutput;
  schedule: {
    active: boolean;
    privacy_status?: 'public' | 'private' | 'unlisted';
    publish_at?: string;
  };
  authCredentials?: any;
}

export interface UploadResult {
  platform: string;
  video_id: string;
  platform_url: string;
  status: string;
  scheduled_for?: string;
  uploaded_at: string;
}
