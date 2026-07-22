import React, { useState, useEffect } from 'react';
import { X, Database, Server, Save, Check } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, onSave }) {
  const [webAppUrl, setWebAppUrl] = useState('');
  const [bridgeUrl, setBridgeUrl] = useState('http://localhost:3001');
  const [savedStatus, setSavedStatus] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebAppUrl(localStorage.getItem('charlie_web_app_url') || '');
      setBridgeUrl(localStorage.getItem('charlie_bridge_url') || 'http://localhost:3001');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('charlie_web_app_url', webAppUrl.trim());
      localStorage.setItem('charlie_bridge_url', bridgeUrl.trim());
    }
    setSavedStatus(true);
    setTimeout(() => {
      setSavedStatus(false);
      onSave();
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950-80 p-4 z-50">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 relative flex flex-col gap-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 cursor-pointer hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-1">
            <span>⚙️</span> System Settings & Integration
          </h2>
          <p className="text-xs text-slate-400">
            Configure your zero-cost Google Sheets memory endpoint and local desktop bridge server.
          </p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4 text-xs">
          {/* Google Apps Script Web App URL */}
          <div>
            <label className="text-slate-300 font-medium mb-1 flex items-center gap-1-5">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Google Apps Script Web App URL (Zero-Cost Memory)</span>
            </label>
            <input
              type="text"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={webAppUrl}
              onChange={(e) => setWebAppUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3-5 py-2-5 text-slate-200 focus-outline-none font-mono text-11"
            />
            <p className="text-11 text-slate-400 mt-1">
              Deploy <code className="text-emerald-400">google-sheets/Code.gs</code> as Web App for Google Sheets persistence.
            </p>
          </div>

          {/* Desktop Bridge Endpoint */}
          <div>
            <label className="text-slate-300 font-medium mb-1 flex items-center gap-1-5">
              <Server className="w-4 h-4 text-purple-400" />
              <span>Local Desktop Bridge URL</span>
            </label>
            <input
              type="text"
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3-5 py-2-5 text-slate-200 focus-outline-none font-mono"
            />
            <p className="text-11 text-slate-400 mt-1">Run <code className="text-purple-400">npm run bridge</code> to start background OS helper.</p>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold flex items-center gap-2 cursor-pointer"
            >
              {savedStatus ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{savedStatus ? 'Saved!' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

