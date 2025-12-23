
export interface ChannelConfig {
  id: string;
  name: string;
  niche: string;
  auth: any | null;
  status: 'idle' | 'running' | 'success' | 'error';
  lastLog?: string;
  step?: number;
  language?: 'zh-TW' | 'en';
  searchKeywords?: string[];
  regionCode?: string;
  // 自動排程擴充
  nextRun?: string; // ISO String
  autoDeploy: boolean;
  lastRun?: string;
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

// Added missing TrendSignals interface for Phase 1
export interface TrendSignals {
  action_verb_frequency: Record<string, number>;
  subject_type_frequency: Record<string, number>;
  object_type_frequency: Record<string, number>;
  structure_type_frequency: Record<string, number>;
  algorithm_signal_frequency: Record<string, number>;
}

// Added missing IModule interface for pipeline architecture
export interface IModule<TInput, TOutput> {
  name: string;
  description: string;
  execute(input: TInput): Promise<TOutput>;
}

// Added missing CandidateTheme interface for Phase 2 & 3
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

// Added missing PromptOutput interface for Phase 4
export interface PromptOutput {
  candidate_id: string;
  prompt: string;
  title_template: string;
  description_template: string;
  candidate_reference: CandidateTheme;
}

// Added missing TestResult interface for unit testing
export interface TestResult {
  moduleName: string;
  passed: boolean;
  logs: string[];
}

// Added missing VideoAsset interface for Phase 5
export interface VideoAsset {
  candidate_id: string;
  video_url: string;
  mime_type: string;
  status: 'generated' | 'failed' | 'idle';
  generated_at: string;
}

// Added missing UploaderInput interface for Phase 6
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

// Added missing UploadResult interface for Phase 6
export interface UploadResult {
  platform: string;
  video_id: string;
  platform_url: string;
  status: string;
  scheduled_for?: string;
  uploaded_at: string;
}
