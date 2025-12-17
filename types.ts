// Domain Types

export interface ShortsData {
  id: string;
  title: string;
  hashtags: string[];
  view_count: number;
  region: string;
  view_growth_rate: number;
}

export interface TrendSignals {
  action_verb_frequency: Record<string, number>;
  subject_type_frequency: Record<string, number>;
  object_type_frequency: Record<string, number>;
  structure_type_frequency: Record<string, number>;
  algorithm_signal_frequency: Record<string, number>;
}

export interface CandidateTheme {
  id: string;
  subject_type: string;
  action_verb: string;
  object_type: string;
  structure_type: string;
  algorithm_signals: string[];
  rationale?: string;
  // Weight Engine Output fields
  total_score?: number;
  selected?: boolean;
  scoring_breakdown?: {
    virality: number;
    feasibility: number;
    trend_alignment: number;
  };
}

export interface ChannelState {
  niche: string;
  avg_views: number;
  target_audience: string;
}

export interface PromptOutput {
  candidate_id: string;
  prompt: string;
  title_template: string;
  description_template: string;
  candidate_reference: CandidateTheme;
}

export interface VideoAsset {
  candidate_id: string;
  video_url: string; // Blob URL (Frontend) or Data URI (Backend)
  mime_type: string;
  status: 'generated' | 'failed';
  generated_at: string;
}

export interface ScheduleConfig {
  publish_at?: string; // ISO Date string for scheduled release
  privacy_status: 'private' | 'public' | 'unlisted';
}

export interface AuthCredentials {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

export interface UploaderInput {
  video_asset: VideoAsset;
  metadata: PromptOutput;
  schedule: ScheduleConfig;
  authCredentials?: AuthCredentials; // Added for Real YouTube API
}

export interface UploadResult {
  platform: 'youtube';
  video_id: string;
  platform_url: string;
  status: 'uploaded' | 'scheduled' | 'failed';
  scheduled_for?: string;
  uploaded_at: string;
}

// Module Interfaces
export interface IModule<Input, Output> {
  name: string;
  description: string;
  execute(input: Input): Promise<Output>;
}

export interface TestResult {
  moduleName: string;
  passed: boolean;
  logs: string[];
}