export interface OptimizationReport {
  generatedAt: string;
  channelHealthScore: number; 
  keyInsights: string[];
  strategicAdvice: string;
  trendingTopics: string[];
  suggestedActions: string[];
}

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
  
  autoDeploy?: boolean;
  weeklySchedule?: {
    days: number[];
    times: string[];
  };
  
  mode?: 'classic' | 'character';
  characterProfile?: CharacterProfile;
  optimizationReport?: OptimizationReport;
  
  // 🚀 新增：頻道預設三本柱設定 (全域記憶)
  defaultVideoType?: 'avatar' | 'product' | 'topic';
  defaultProductDescription?: string;
  defaultKlingModel?: string;

  // 🚀 自動化系統 (Auto-Pilot)
  autoPilot: {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    postTime: string; 
    days: number[]; 
    videoType: 'avatar' | 'product' | 'topic'; // 修改：綁定影片類型而非引擎
    mode: 'hybrid' | 'ai_only'; 
  };
  lastRun?: string;
  lastTriggeredSlot?: string;

  mptConfig?: {
    voiceId?: string; 
    bgmVolume?: number; 
    font?: string;
    fontSize?: number;
    subtitleColor?: string; 
    videoRatio?: string; 
    useStockFootage?: boolean; 
    videoEngine?: 'veo' | 'sora' | 'jimeng' | 'heygen' | 'kling'; 
    ttsEngine?: 'edge' | 'elevenlabs';
    elevenLabsVoiceId?: string;
    heygenAvatarId?: string; 
  };

  social: {
    youtube: { connected: boolean; token?: any; upload: boolean };
    instagram: { connected: boolean; token?: any; upload: boolean; pageId?: string };
    facebook: { connected: boolean; token?: any; upload: boolean; pageId?: string };
  };
}

export interface ScriptData {
  title: string;
  scenes: ScriptScene[];
  keywords: string[]; 
  bgmKeyword?: string; 
  socialMediaCopy?: { 
    title: string;
    description: string;
    hashtags: string[];
  };
  referenceImage?: string; 
}

export interface ScriptScene {
  id: number;
  narration: string; 
  visual_cue: string; 
  duration_estimate?: number; 
}

export interface CharacterProfile {
  id: string;
  name: string;
  age?: string;          
  occupation?: string;   
  gender?: string;       
  personality: string;   
  voiceTone: string;     
  contentFocus: string;  
  constraints: string;   
  description: string;   
  images: {
    threeView?: string; 
    front?: string;     
    fullBody?: string;  
    side?: string;      
    back?: string;      
    expressionSheet?: string; 
  };
}

export interface AgentMemory {
  history: VideoLog[];
  strategy_bias: {
    dance: number;
    vlog: number;
    skit: number;
    challenge: number;
  };
}

export interface VideoLog {
  videoId: string;
  timestamp: string;
  topic: string;
  category: 'dance' | 'vlog' | 'skit' | 'challenge'; 
  reasoning: string; 
  stats?: { 
    views: number;
    likes: number;
    retention: number; 
  };
}

export interface PipelineMetadata { prompt: string; title: string; desc: string; }
export interface ShortsData { id: string; title: string; hashtags: string[]; view_count: number; region?: string; view_growth_rate: number; publishedAt?: string; }
export interface ChannelState { niche: string; avg_views: number; target_audience: string; }
export interface TrendSignals { action_verb_frequency: Record<string, number>; subject_type_frequency: Record<string, number>; object_type_frequency: Record<string, number>; structure_type_frequency: Record<string, number>; algorithm_signal_frequency: Record<string, number>; }
export interface IModule<TInput, TOutput> { name: string; description: string; execute(input: TInput): Promise<TOutput>; }
export interface CandidateTheme { id: string; subject_type: string; action_verb: string; object_type: string; structure_type: string; algorithm_signals: string[]; rationale?: string; total_score: number; selected: boolean; scoring_breakdown?: { virality: number; feasibility: number; trend_alignment: number; }; }
export interface PromptOutput { candidate_id: string; prompt: string; title_template: string; description_template: string; candidate_reference: CandidateTheme; }
export interface TestResult { moduleName: string; passed: boolean; logs: string[]; }
export interface VideoAsset { candidate_id: string; video_url: string; mime_type: string; status: 'generated' | 'failed' | 'idle'; generated_at: string; }
export interface UploaderInput { video_asset: VideoAsset; metadata: PromptOutput; schedule: { active: boolean; privacy_status?: 'public' | 'private' | 'unlisted'; publish_at?: string; }; authCredentials?: any; }
export interface UploadResult { platform: string; video_id: string; platform_url: string; status: string; scheduled_for?: string; uploaded_at: string; }
