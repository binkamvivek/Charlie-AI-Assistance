import React from 'react';
import { Video, ExternalLink } from 'lucide-react';

export default function YoutubeFeed({ interests = [] }) {
  // Generate video cards dynamically based on user interest keywords
  const videoTopics = interests.length > 0 
    ? interests.map(i => i.Topic || i.Key || i.Value).filter(Boolean)
    : ['React 19 & Server Components', 'AI Function Calling & Agents', 'Astro Web Development'];

  const mockVideos = [
    {
      id: 'dQw4w9WgXcQ',
      title: `${videoTopics[0] || 'React 19 Architecture'}: Complete Overview`,
      channel: 'Tech & AI Insights',
      views: '45K views',
      tag: videoTopics[0] || 'React'
    },
    {
      id: 'L_LUpnjgPso',
      title: `Mastering ${videoTopics[1] || 'AI Function Calling'}: Step-by-Step`,
      channel: 'Developer Matrix',
      views: '82K views',
      tag: videoTopics[1] || 'AI Agents'
    },
    {
      id: '2OTq15A1ggU',
      title: `${videoTopics[2] || 'Astro 5 Islands'}: Production Best Practices`,
      channel: 'Fullstack Weekly',
      views: '29K views',
      tag: videoTopics[2] || 'Astro'
    }
  ];

  return (
    <div className="bento-card flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-red-500" />
            <h2 className="text-sm font-semibold text-slate-200">YouTube Learning Feed</h2>
          </div>
          <span className="text-10 uppercase tracking-wider px-2 py-0-5 rounded-full bg-red-500-10 text-red-400 border border-red-500-20 font-mono">
            Personalized
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {mockVideos.map((video, idx) => (
            <a
              key={idx}
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(video.title)}`}
              target="_blank"
              rel="noreferrer"
              className="p-3 rounded-xl bg-slate-950-60 border border-slate-800-80 hover-border-sky-500-50 transition-all text-left block"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs font-medium text-slate-200 line-clamp-2">
                  {video.title}
                </span>
                <ExternalLink className="w-3-5 h-3-5 text-slate-500 shrink-0" />
              </div>
              <div className="mt-2 flex items-center justify-between text-11 text-slate-400 font-mono">
                <span>{video.channel}</span>
                <span className="text-slate-400">{video.views}</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="mt-4 text-11 text-slate-400 text-center border-t border-slate-800-60 pt-2 font-mono">
        Auto-refreshed from Chrome browsing & memory topics
      </div>
    </div>
  );
}
