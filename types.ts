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