
export interface ChannelConfig {
  id: string;
  name: string;
  niche: string;
  concept?: string; // 新增：詳細的風格與概念描述
  auth: any | null;
  status: 'idle' | 'running' | 'success' | 'error';
  lastLog?: string;
  step?: number;
  language?: 'zh-TW' | 'en';
  searchKeywords?: string[];
  regionCode?: string;
  
  // 升級版排程系統
  autoDeploy: boolean;
  weeklySchedule?: {
    days: number[]; // 0-6 (Sun-Sat)
    times: string[]; // ["HH:mm", "HH:mm", "HH:mm"]
  };
  lastRun?: string;
  lastTriggeredSlot?: string; // 格式: "day_time" 防止重複觸發
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