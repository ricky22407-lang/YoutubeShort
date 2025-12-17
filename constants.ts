import { ShortsData, ChannelState } from './types';

// Mock Input Data
export const MOCK_SHORTS_DATA: ShortsData[] = [
  {
    id: "v1",
    title: "I crushed a diamond with a hydraulic press!",
    hashtags: ["#satisfying", "#science", "#destruction"],
    view_count: 5000000,
    region: "US",
    view_growth_rate: 1.5
  },
  {
    id: "v2",
    title: "POV: You forgot your homework",
    hashtags: ["#relatable", "#school", "#comedy"],
    view_count: 2000000,
    region: "US",
    view_growth_rate: 0.8
  },
  {
    id: "v3",
    title: "Cooking a steak in a toaster",
    hashtags: ["#cooking", "#lifehack", "#fail"],
    view_count: 3500000,
    region: "UK",
    view_growth_rate: 2.1
  },
  {
    id: "v4",
    title: "My dog reacts to invisible wall",
    hashtags: ["#dog", "#reaction", "#funny"],
    view_count: 1500000,
    region: "US",
    view_growth_rate: 0.5
  }
];

export const MOCK_CHANNEL_STATE: ChannelState = {
  niche: "General Entertainment / Experiments",
  avg_views: 100000,
  target_audience: "Gen Z males 18-24"
};

// System Instructions for Modules
export const SYSTEM_INSTRUCTIONS = {
  TREND_EXTRACTOR: `
    You are the Trend Signal Extractor module.
    Your job is to analyze raw YouTube Shorts data and extract statistical trend signals.
    Output MUST be a strictly valid JSON object matching the TrendSignals schema.
    Focus on extracting:
    - Action verbs (e.g., crushing, cooking, reacting)
    - Subject types (e.g., human, dog, machine)
    - Object types (e.g., diamond, steak, homework)
    - Structure types (e.g., experiment, skit, POV)
    - Algorithm signals (high growth rate keywords)
  `,
  CANDIDATE_GENERATOR: `
    You are the Candidate Theme Generator module.
    Based on the provided Trend Signals, generate 3 innovative candidate themes for new Shorts.
    Output MUST be a strictly valid JSON array of CandidateTheme objects.
    Ensure 'selected' is false and 'total_score' is 0 initially.
    Be creative but grounded in the data provided.
  `,
  WEIGHT_ENGINE: `
    You are the Candidate Weight Engine module.
    You will receive a list of Candidate Themes and Channel State.
    Evaluate each candidate based on:
    1. Virality potential (0-10)
    2. Feasibility (0-10)
    3. Trend Alignment (0-10)
    Calculate a total_score (sum).
    Mark 'selected': true for the highest scoring candidate only.
    Output the updated JSON list.
  `,
  PROMPT_COMPOSER: `
    You are the Prompt Composer module.
    You will receive a SELECTED Candidate Theme.
    Generate a detailed production prompt, a catchy title template, and a description.
    Output MUST be a JSON object matching the PromptOutput schema.
  `
};