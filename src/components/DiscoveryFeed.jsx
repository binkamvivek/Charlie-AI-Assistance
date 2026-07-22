import React from 'react';
import { Compass, ShoppingBag, BookOpen, TrendingUp, ArrowUpRight } from 'lucide-react';

export default function DiscoveryFeed({ topics = [] }) {
  const userInterests = topics.length > 0 ? topics : ['TypeScript', 'Gemini AI', 'Tailwind CSS', 'Astro Framework'];

  const discoveryItems = [
    {
      type: 'Documentation',
      icon: BookOpen,
      color: 'text-sky-400',
      bg: 'bg-sky-500-10 border-sky-500-20',
      title: `${userInterests[0] || 'TypeScript'} Best Practices & Performance Guide`,
      source: 'Official Docs'
    },
    {
      type: 'Trending Tool',
      icon: TrendingUp,
      color: 'text-purple-400',
      bg: 'bg-purple-500-10 border-purple-500-20',
      title: 'Gemini 2.5 & 3.6 Multimodal Function Calling API',
      source: 'Google AI Cloud'
    },
    {
      type: 'Product Discovery',
      icon: ShoppingBag,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500-10 border-emerald-500-20',
      title: 'Ergonomic Mechanical Keyboard & Ultrawide Monitor Setup',
      source: 'Hardware Radar'
    }
  ];

  return (
    <div className="bento-card flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-semibold text-slate-200">Topic & Product Discovery</h2>
          </div>
          <span className="text-10 uppercase tracking-wider px-2 py-0-5 rounded-full bg-purple-500-10 text-purple-400 border border-purple-500-20 font-mono">
            Radar
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {discoveryItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <a
                key={idx}
                href={`https://www.google.com/search?q=${encodeURIComponent(item.title)}`}
                target="_blank"
                rel="noreferrer"
                className="p-3 rounded-xl bg-slate-950-60 border border-slate-800-80 transition-all text-left block"
              >
                <div className="flex items-center justify-between mb-1-5">
                  <span className={`text-10 font-mono px-2 py-0-5 rounded border ${item.bg} ${item.color}`}>
                    {item.type}
                  </span>
                  <ArrowUpRight className="w-3-5 h-3-5 text-slate-500" />
                </div>
                <h3 className="text-xs font-medium text-slate-200 line-clamp-2">
                  {item.title}
                </h3>
                <span className="text-10 text-slate-400 font-mono mt-2 block">
                  Source: {item.source}
                </span>
              </a>
            );
          })}
        </div>
      </div>

      <div className="mt-4 text-11 text-slate-400 text-center border-t border-slate-800-60 pt-2 font-mono">
        Auto-curated for user interest topics
      </div>
    </div>
  );
}
