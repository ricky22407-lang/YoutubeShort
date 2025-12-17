import React, { useState } from 'react';
import { ShortsData, ChannelState } from '../types';

interface DataInputFormProps {
  initialShortsData: ShortsData[];
  initialChannelState: ChannelState;
  onSave: (shorts: ShortsData[], channel: ChannelState) => void;
}

export const DataInputForm: React.FC<DataInputFormProps> = ({ initialShortsData, initialChannelState, onSave }) => {
  const [shortsJson, setShortsJson] = useState(JSON.stringify(initialShortsData, null, 2));
  const [channelJson, setChannelJson] = useState(JSON.stringify(initialChannelState, null, 2));
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      const parsedShorts = JSON.parse(shortsJson);
      const parsedChannel = JSON.parse(channelJson);
      
      if (!Array.isArray(parsedShorts)) throw new Error("Shorts Data must be an array");
      
      onSave(parsedShorts, parsedChannel);
      setError(null);
      setIsExpanded(false);
    } catch (e: any) {
      setError("JSON 格式錯誤: " + e.message);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-8">
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <h3 className="text-white font-bold flex items-center gap-2">
          📝 資料輸入設定 (趨勢數據 & 頻道狀態)
        </h3>
        <span className="text-slate-400 text-sm">{isExpanded ? '▲ 收起' : '▼ 展開編輯'}</span>
      </div>

      {isExpanded && (
        <div className="mt-4 animate-fade-in space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Raw Shorts Data (JSON)</label>
            <textarea
              value={shortsJson}
              onChange={(e) => setShortsJson(e.target.value)}
              className="w-full h-48 bg-slate-900 border border-slate-700 rounded p-3 text-xs font-mono text-emerald-400 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Channel State (JSON)</label>
            <textarea
              value={channelJson}
              onChange={(e) => setChannelJson(e.target.value)}
              className="w-full h-32 bg-slate-900 border border-slate-700 rounded p-3 text-xs font-mono text-blue-400 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {error && (
            <div className="text-red-400 text-xs font-bold bg-red-900/20 p-2 rounded">
              ❌ {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-sm transition-colors"
            >
              儲存並更新
            </button>
          </div>
        </div>
      )}
    </div>
  );
};