import React, { useState } from 'react';
import { Database, Plus, Trash2 } from 'lucide-react';
import { SheetsService } from '../services/sheetsService';

export default function MemoryGraph({ memoryFacts = {}, onMemoryUpdated }) {
  const [activeTab, setActiveTab] = useState('Identity_Facts');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const tabs = [
    { id: 'Identity_Facts', label: 'Identity' },
    { id: 'Interests_Log', label: 'Interests' },
    { id: 'Task_Routines', label: 'Routines' }
  ];

  const currentList = memoryFacts[activeTab] || [];

  const handleAddFact = async (e) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    const result = await SheetsService.saveFact(activeTab, newKey.trim(), newValue.trim());
    onMemoryUpdated(result.facts);
    setNewKey('');
    setNewValue('');
    setIsAdding(false);
  };

  const handleDelete = async (key) => {
    const result = await SheetsService.deleteFact(activeTab, key);
    onMemoryUpdated(result.facts);
  };

  return (
    <div className="bento-card flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200">Memory Profile Graph</h2>
          </div>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="p-1 rounded-lg bg-emerald-500-10 text-emerald-400 border border-emerald-500-30 transition-all text-xs flex items-center gap-1 px-2 cursor-pointer"
          >
            <Plus className="w-3-5 h-3-5" />
            <span>Add Fact</span>
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 p-1 bg-slate-950-80 rounded-xl border border-slate-800 mb-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-1-5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-emerald-500-20 text-emerald-300 border border-emerald-500-30'
                  : 'text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Add Form */}
        {isAdding && (
          <form onSubmit={handleAddFact} className="mb-3 p-3 bg-slate-950-90 rounded-xl border border-emerald-500-30 flex flex-col gap-2">
            <input
              type="text"
              placeholder="Fact Key (e.g. Favorite Language)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2-5 py-1-5 text-xs text-slate-200 focus-outline-none"
            />
            <input
              type="text"
              placeholder="Fact Value (e.g. Python)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2-5 py-1-5 text-xs text-slate-200 focus-outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-2-5 py-1 text-xs text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-emerald-500 text-slate-950 text-xs font-bold rounded-md cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Fact Items */}
        <div className="flex flex-col gap-2 max-h-[210px] overflow-y-auto pr-1">
          {currentList.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 font-mono">
              No memory facts stored under {activeTab}
            </div>
          ) : (
            currentList.map((item, idx) => {
              const k = item.Key || item.Topic || `Fact #${idx + 1}`;
              const v = item.Value || item.Source || item.Details || '';

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2-5 rounded-xl bg-slate-950-60 border border-slate-800-80 transition-all text-xs"
                >
                  <div className="flex flex-col pr-2">
                    <span className="font-mono text-emerald-400 font-medium truncate">{k}</span>
                    <span className="text-slate-300 truncate">{v}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(k)}
                    className="p-1 rounded text-slate-500 hover:text-red-400 transition-all cursor-pointer"
                    title="Delete fact"
                  >
                    <Trash2 className="w-3-5 h-3-5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-3 text-11 text-slate-400 text-center border-t border-slate-800-60 pt-2 font-mono">
        Autonomous bi-directional Google Sheets memory
      </div>
    </div>
  );
}
