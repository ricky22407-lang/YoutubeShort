
export interface ScheduleConfig {
  activeDays: number[]; // 0-6 (Sun-Sat)
  time: string; // "HH:mm"
  countPerDay: number;
  autoEnabled: boolean;
}

export interface ChannelConfig {
  id: string;
  name: string;
  niche: string;
  auth: any | null;
  status: 'idle' | 'running' | 'success' | 'error';
  lastLog?: string;
  step?: number;
  searchKeywords?: string[];
  regionCode?: string;
  language?: 'zh-TW' | 'en';
  schedule?: ScheduleConfig; // 新增排程設定
  lastRunTime?: number; // 紀錄上次執行時間避免重複
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

// Added TrendSignals interface to fix "Module '../types' has no exported member 'TrendSignals'"
export interface TrendSignals {
  action_verb_frequency: Record<string, number>;
  subject_type_frequency: Record<string, number>;
  object_type_frequency: Record<string, number>;
  structure_type_frequency: Record<string, number>;
  algorithm_signal_frequency: Record<string, number>;
}

// Added CandidateTheme interface to fix "Module '../types' has no exported member 'CandidateTheme'"
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
  candidate_reference: any;
}

export interface VideoAsset {
  candidate_id: string;
  video_url: string;
  mime_type: string;
  status: string;
  generated_at: string;
  base64?: string;
}

// Added UploaderInput interface to fix "Module '../types' has no exported member 'UploaderInput'"
export interface UploaderInput {
  video_asset: VideoAsset;
  metadata: PromptOutput;
  authCredentials?: any | null;
  schedule: {
    active: boolean;
    privacy_status?: 'public' | 'private' | 'unlisted';
    publish_at?: string;
  };
}

export interface UploadResult {
  platform: string;
  video_id: string;
  platform_url: string;
  status: string;
  scheduled_for?: string;
  uploaded_at: string;
}

export interface TestResult {
  moduleName: string;
  passed: boolean;
  logs: string[];
}

export interface IModule<I, O> {
  name: string;
  description: string;
  execute(input: I): Promise<O>;
}
