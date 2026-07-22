import React from 'react';
import { Settings, Database, Server, Cpu } from 'lucide-react';

export default function Header({ bridgeStatus, memorySynced, onOpenSettings }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950-40">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500 p-0-5">
          <div className="w-full h-full bg-slate-950 rounded-lg flex items-center justify-center">
            <Cpu className="w-5 h-5 text-sky-400" />
          </div>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">
            Charlie AI Assistant
          </h1>
          <p className="text-xs text-slate-400 font-mono">Personalized AI Operating Canvas</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Memory Sync Badge */}
        <div className="flex items-center gap-2 px-3 py-1-5 rounded-full bg-slate-900 border border-slate-800 text-xs">
          <Database className={`w-3-5 h-3-5 ${memorySynced ? 'text-emerald-400' : 'text-slate-400'}`} />
          <span className="text-slate-300 font-medium">Sheets Memory:</span>
          <span className={memorySynced ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
            {memorySynced ? 'Live Sync' : 'Local Backup'}
          </span>
        </div>

        {/* Bridge Health Badge */}
        <div className="flex items-center gap-2 px-3 py-1-5 rounded-full bg-slate-900 border border-slate-800 text-xs">
          <Server className={`w-3-5 h-3-5 ${bridgeStatus === 'online' ? 'text-sky-400' : 'text-slate-500'}`} />
          <span className="text-slate-300 font-medium">Desktop Bridge:</span>
          <span className={bridgeStatus === 'online' ? 'text-sky-400 font-semibold' : 'text-slate-400'}>
            {bridgeStatus === 'online' ? 'Connected' : 'Offline'}
          </span>
        </div>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 cursor-pointer"
          title="Open Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
