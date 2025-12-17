import React, { useState } from 'react';
import { TestResult } from '../types';

interface ModuleCardProps {
  title: string;
  description: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  onRunTest: () => Promise<TestResult>;
  onExecute: () => void;
  canExecute: boolean;
  data: any;
  testResult: TestResult | null;
}

export const ModuleCard: React.FC<ModuleCardProps> = ({
  title,
  description,
  status,
  onRunTest,
  onExecute,
  canExecute,
  data,
  testResult
}) => {
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'done'>('idle');

  const handleTest = async () => {
    setTestStatus('running');
    await onRunTest();
    setTestStatus('done');
  };

  return (
    <div className={`border rounded-lg p-6 bg-slate-800 shadow-lg flex flex-col gap-4 ${status === 'success' ? 'border-green-500' : 'border-slate-700'}`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
          <p className="text-slate-400 text-sm">{description}</p>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-mono ${
          status === 'success' ? 'bg-green-900 text-green-300' :
          status === 'loading' ? 'bg-blue-900 text-blue-300' :
          status === 'error' ? 'bg-red-900 text-red-300' :
          'bg-slate-700 text-slate-400'
        }`}>
          {status.toUpperCase()}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={handleTest}
          disabled={testStatus === 'running'}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm transition-colors disabled:opacity-50"
        >
          {testStatus === 'running' ? 'Running Tests...' : 'Run Unit Tests'}
        </button>
        <button
          onClick={onExecute}
          disabled={!canExecute || status === 'loading'}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'loading' ? 'Processing...' : 'Execute Module'}
        </button>
      </div>

      {/* Test Logs */}
      {testResult && (
        <div className={`p-3 rounded text-xs font-mono border ${testResult.passed ? 'bg-green-900/20 border-green-900' : 'bg-red-900/20 border-red-900'}`}>
          <div className="font-bold mb-1">{testResult.passed ? 'TESTS PASSED' : 'TESTS FAILED'}</div>
          {testResult.logs.map((log, i) => (
            <div key={i} className="text-slate-300">{log}</div>
          ))}
        </div>
      )}

      {/* Data Output Preview */}
      {data && (
        <div className="mt-2">
          <div className="text-xs text-slate-500 uppercase font-bold mb-1">Output JSON</div>
          <pre className="bg-slate-950 p-3 rounded text-xs text-green-400 overflow-auto max-h-48 scrollbar-thin scrollbar-thumb-slate-700">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};