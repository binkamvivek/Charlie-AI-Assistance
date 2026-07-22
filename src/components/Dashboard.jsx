import React, { useState, useEffect } from 'react';
import Header from './Header';
import CentralHub from './CentralHub';
import YoutubeFeed from './YoutubeFeed';
import DiscoveryFeed from './DiscoveryFeed';
import MemoryGraph from './MemoryGraph';
import QuickActions from './QuickActions';
import SettingsModal from './SettingsModal';
import { SheetsService } from '../services/sheetsService';
import { BridgeService } from '../services/bridgeService';
import { IntentHandler } from '../services/intentHandler';

export default function Dashboard() {
  const [memoryFacts, setMemoryFacts] = useState({});
  const [bridgeStatus, setBridgeStatus] = useState('offline');
  const [memorySynced, setMemorySynced] = useState(false);
  const [statusText, setStatusText] = useState('System Ready');
  const [currentResponse, setCurrentResponse] = useState('');
  const [cardPayload, setCardPayload] = useState(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Load initial memory facts & check Desktop Bridge status
  const loadData = async () => {
    const facts = await SheetsService.getFacts();
    setMemoryFacts(facts);

    const hasWebAppUrl = Boolean(SheetsService.getWebAppUrl());
    setMemorySynced(hasWebAppUrl);

    const health = await BridgeService.checkHealth();
    setBridgeStatus(health.status);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = async (messageText) => {
    setStatusText('Matching Intent...');
    setCurrentResponse('');
    setCardPayload(null);

    const res = await IntentHandler.processInput(messageText, memoryFacts, (newStatus) => {
      setStatusText(newStatus);
    });

    setCurrentResponse(res.text);
    if (res.cardPayload) {
      setCardPayload(res.cardPayload);
    }
    setStatusText(res.toolExecuted ? 'Task Executed Successfully' : 'Idle / Ready');

    // Refresh memory facts in case tools modified them
    const updatedFacts = res.updatedFacts || await SheetsService.getFacts();
    setMemoryFacts(updatedFacts);
  };

  const handleActionTriggered = (actionMsg) => {
    setStatusText('Executing Task...');
    setCurrentResponse(actionMsg);
    setCardPayload(null);
    setTimeout(() => {
      setStatusText('System Ready');
    }, 4000);
  };

  return (
    <div className="min-h-screen flex flex-col relative text-slate-100 font-sans">
      {/* Background Animated Mesh Gradient */}
      <div className="mesh-gradient-bg" />

      {/* Header */}
      <Header
        bridgeStatus={bridgeStatus}
        memorySynced={memorySynced}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Spatial Bento Grid */}
      <main className="flex-1 p-6 max-w-1600 mx-auto w-full flex flex-col justify-center">
        <div className="grid grid-cols-1 md-grid-cols-4 gap-6 items-stretch">
          
          {/* Column 1 (Left) */}
          <div className="flex flex-col gap-6 md-col-span-1">
            <YoutubeFeed interests={memoryFacts.Interests_Log || []} />
            <MemoryGraph memoryFacts={memoryFacts} onMemoryUpdated={setMemoryFacts} />
          </div>

          {/* Center Stage AI Hub (Column 2-3) */}
          <div className="flex flex-col md-col-span-2 justify-center">
            <CentralHub
              onSendMessage={handleSendMessage}
              status={statusText}
              currentResponse={currentResponse}
              cardPayload={cardPayload}
              ttsEnabled={ttsEnabled}
              setTtsEnabled={setTtsEnabled}
            />
          </div>

          {/* Column 4 (Right) */}
          <div className="flex flex-col gap-6 md-col-span-1">
            <DiscoveryFeed topics={memoryFacts.Interests_Log ? memoryFacts.Interests_Log.map(i => i.Topic) : []} />
            <QuickActions onActionTriggered={handleActionTriggered} />
          </div>

        </div>
      </main>

      {/* Settings Dialog Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={loadData}
      />
    </div>
  );
}

