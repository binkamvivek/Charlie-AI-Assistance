import React from 'react';
import { Terminal, Code, Mail, HardDrive, Play, Monitor } from 'lucide-react';
import { BridgeService } from '../services/bridgeService';

export default function QuickActions({ onActionTriggered }) {
  const actions = [
    {
      id: 'vscode',
      name: 'VS Code',
      desc: 'Launch Workspace Code Editor',
      icon: Code,
      color: 'text-sky-400',
      action: async () => {
        const res = await BridgeService.launchApp('vscode');
        onActionTriggered(res.success ? 'VS Code launched via Desktop Bridge' : 'Bridge Error: Ensure Desktop Helper is running');
      }
    },
    {
      id: 'terminal',
      name: 'Terminal / CMD',
      desc: 'Launch Command Prompt',
      icon: Terminal,
      color: 'text-purple-400',
      action: async () => {
        const res = await BridgeService.launchApp('terminal');
        onActionTriggered(res.success ? 'Terminal launched' : 'Bridge Error');
      }
    },
    {
      id: 'email',
      name: 'Draft Email',
      desc: 'Open Mail Client with Template',
      icon: Mail,
      color: 'text-pink-400',
      action: async () => {
        const res = await BridgeService.draftEmail({ subject: 'Update from Charlie AI', body: 'Hello!' });
        onActionTriggered(res.success ? 'Email client opened with draft' : 'Bridge Error');
      }
    },
    {
      id: 'system',
      name: 'System Logs',
      desc: 'Check Memory & Hardware Status',
      icon: HardDrive,
      color: 'text-emerald-400',
      action: async () => {
        const res = await BridgeService.getSystemStatus();
        if (res.success && res.data) {
          onActionTriggered(`System Status: ${res.data.cpus} CPUs, ${res.data.freeMem} free RAM of ${res.data.totalMem}`);
        } else {
          onActionTriggered('Could not fetch system logs. Check Desktop Bridge helper.');
        }
      }
    }
  ];

  return (
    <div className="bento-card flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-200">System Quick Actions</h2>
          </div>
          <span className="text-10 uppercase tracking-wider px-2 py-0-5 rounded-full bg-sky-500-10 text-sky-400 border border-sky-500-20 font-mono">
            Desktop Bridge
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id}
                onClick={act.action}
                className="p-3 rounded-xl bg-slate-950-60 border border-slate-800-80 transition-all text-left flex flex-col justify-between cursor-pointer min-h-[90px]"
              >
                <div className="flex items-center justify-between w-full">
                  <Icon className={`w-5 h-5 ${act.color}`} />
                  <Play className="w-3 h-3 text-slate-600" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    {act.name}
                  </div>
                  <div className="text-10 text-slate-400 truncate mt-0-5 font-mono">
                    {act.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 text-11 text-slate-400 text-center border-t border-slate-800-60 pt-2 font-mono">
        Executes OS tasks via localhost bridge
      </div>
    </div>
  );
}
