import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX, Activity, ExternalLink, Moon, Sun, Settings } from 'lucide-react';

export default function CentralHub({ onSendMessage, status, currentResponse, cardPayload, ttsEnabled, setTtsEnabled, awayMode, onToggleAway, onUpdateAwayConfig }) {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showAwayConfig, setShowAwayConfig] = useState(false);
  const [awayPhoneInput, setAwayPhoneInput] = useState('');
  const [awayMessageInput, setAwayMessageInput] = useState('');
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const animationFrameRef = useRef(null);
  const onSendRef = useRef(onSendMessage);

  // Keep callback ref in sync without triggering effect re-runs
  useEffect(() => {
    onSendRef.current = onSendMessage;
  }, [onSendMessage]);

  // Web Speech API Initialization (runs once on mount)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported in this browser.');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onstart = () => setIsListening(true);

    rec.onend = () => {
      // If still expected to be listening (continuous mode), restart
      if (recognitionRef.current === rec) {
        setIsListening(false);
      }
    };

    rec.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings.');
      }
      setIsListening(false);
    };

    rec.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputText(transcript);

      // Check if the latest result is final
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        const finalText = transcript;
        setInputText('');
        if (onSendRef.current) {
          onSendRef.current(finalText);
        }
      }
    };

    recognitionRef.current = rec;

    return () => {
      try { rec.abort(); } catch (_) {}
      recognitionRef.current = null;
    };
  }, []); // Run once on mount — no dependency on onSendMessage

  // Audio Waveform Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let phase = 0;

    const renderWave = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isListening ? '#ec4899' : status.includes('Executing') ? '#c084fc' : '#38bdf8';

      for (let x = 0; x < width; x++) {
        const amplitude = isListening ? 15 : status.includes('Executing') ? 10 : 4;
        const frequency = 0.05;
        const y = centerY + Math.sin(x * frequency + phase) * amplitude * Math.sin((x / width) * Math.PI);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += 0.1;
      animationFrameRef.current = requestAnimationFrame(renderWave);
    };

    renderWave();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isListening, status]);

  // Speech Synthesis TTS
  useEffect(() => {
    if (currentResponse && ttsEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentResponse);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, [currentResponse, ttsEnabled]);

  // Sync away config inputs when away mode state changes
  useEffect(() => {
    if (awayMode.active) {
      setAwayPhoneInput(awayMode.phoneNumbers.join(', '));
      setAwayMessageInput(awayMode.customMessage || '');
    }
  }, [awayMode.active, awayMode.phoneNumbers, awayMode.customMessage]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Web Speech API is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setInputText('');
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="bento-card col-span-1 md-col-span-2 row-span-2 flex flex-col items-center justify-between p-6 bg-slate-900-60 relative border border-slate-800">
      {/* Top Controls Bar */}
      <div className="w-full flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2 font-mono">
          <Activity className="w-4 h-4 text-sky-400" />
          <span className="text-slate-300 font-semibold">{status}</span>
        </div>
        <button
          onClick={() => setTtsEnabled(!ttsEnabled)}
          className={`flex items-center gap-1-5 px-3 py-1 rounded-full border transition-all ${
            ttsEnabled ? 'border-sky-500-50 bg-sky-500-10 text-sky-400' : 'border-slate-800 bg-slate-900 text-slate-500'
          }`}
        >
          {ttsEnabled ? <Volume2 className="w-3-5 h-3-5" /> : <VolumeX className="w-3-5 h-3-5" />}
          <span>{ttsEnabled ? 'Voice On' : 'Mute Voice'}</span>
        </button>
      </div>

      {/* Glowing Floating Central Node + Away Toggle */}
      <div className="my-6 flex flex-col items-center gap-4">
        <div className="flex items-center gap-6">
          {/* Voice Button */}
          <div
            onClick={toggleListening}
            className={`glow-orb ${isListening ? 'listening' : status.includes('Executing') ? 'thinking' : ''}`}
            title={isListening ? 'Click to stop listening' : 'Click to speak to Charlie'}
          >
            {isListening ? (
              <MicOff className="w-10 h-10 text-white" />
            ) : (
              <Mic className="w-10 h-10 text-white" />
            )}
          </div>

          {/* Away/Back Toggle Button */}
          <div className="flex flex-col items-center gap-1">
            <div
              onClick={onToggleAway}
              className={`glow-orb away-orb ${awayMode.active ? 'away-on' : 'away-off'}`}
              title={awayMode.active ? 'Click to come back (disable auto-reply)' : 'Click to go away (enable auto-reply)'}
            >
              {awayMode.active ? (
                <Moon className="w-7 h-7 text-white" />
              ) : (
                <Sun className="w-7 h-7 text-white" />
              )}
            </div>
            <span className={`text-xs font-bold font-mono tracking-wider ${awayMode.active ? 'text-amber-400' : 'text-emerald-400'}`}>
              {awayMode.active ? 'AWAY' : 'BACK'}
            </span>
          </div>
        </div>

        <p className="text-xs font-mono text-slate-400">
          {awayMode.active
            ? 'Away mode ON — Charlie is handling conversations'
            : isListening
              ? 'Listening... Speak now'
              : 'Click glowing node or type below'}
        </p>

        {/* Away Mode Config Panel */}
        {awayMode.active && (
          <div className="w-full max-w-md p-3 rounded-xl bg-slate-950-90 border border-amber-800-40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-amber-400 font-semibold tracking-wide">AUTO-REPLY ACTIVE</span>
              <button
                onClick={() => setShowAwayConfig(!showAwayConfig)}
                className="p-1 rounded-md hover-bg-slate-800 transition-colors"
                title="Configure away settings"
              >
                <Settings className="w-3-5 h-3-5 text-slate-400" />
              </button>
            </div>
            {showAwayConfig && (
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-xs text-slate-500 font-mono mb-1 block">Phone Numbers (comma separated, with country code)</label>
                  <input
                    type="text"
                    value={awayPhoneInput}
                    onChange={(e) => setAwayPhoneInput(e.target.value)}
                    placeholder="+919876543210, +911234567890"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-mono mb-1 block">Auto-Reply Message</label>
                  <textarea
                    value={awayMessageInput}
                    onChange={(e) => setAwayMessageInput(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 font-mono resize-none"
                  />
                </div>
                <button
                  onClick={() => {
                    const nums = awayPhoneInput.split(',').map(n => n.trim()).filter(Boolean);
                    onUpdateAwayConfig(nums, awayMessageInput);
                    setShowAwayConfig(false);
                  }}
                  className="self-end px-4 py-1-5 rounded-lg bg-amber-600 text-white text-xs font-bold hover-bg-amber-500 transition-colors"
                >
                  Save & Apply
                </button>
              </div>
            )}
            {!showAwayConfig && awayMode.phoneNumbers.length > 0 && (
              <p className="text-xs text-slate-500 font-mono">
                Replying to {awayMode.phoneNumbers.length} number(s)
              </p>
            )}
          </div>
        )}

        {/* Live Audio Waveform Canvas */}
        <canvas ref={canvasRef} width={280} height={40} className="w-full rounded-lg" />
      </div>

      {/* Response Box */}
      {currentResponse && (
        <div className="w-full mb-4 p-4 rounded-xl bg-slate-950-80 border border-slate-800 text-sm text-slate-200 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-sky-400 shrink-0 mt-0-5" />
            <div className="font-sans">{currentResponse}</div>
          </div>

          {/* Dynamic Generated Web Search / YouTube Cards */}
          {cardPayload && (
            <div className="mt-1 grid grid-cols-1 sm-grid-cols-2 gap-2 pt-3 border-t border-slate-800">
              <a
                href={cardPayload.googleUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2-5 rounded-lg bg-sky-500-10 border border-sky-500-30 hover-border-sky-400 transition-all flex items-center justify-between text-xs text-sky-300 font-mono"
              >
                <span>🌐 Search Google: "{cardPayload.query}"</span>
                <ExternalLink className="w-3-5 h-3-5" />
              </a>
              <a
                href={cardPayload.youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2-5 rounded-lg bg-red-500-10 border border-red-500-30 hover-border-red-400 transition-all flex items-center justify-between text-xs text-red-300 font-mono"
              >
                <span>📺 Search YouTube: "{cardPayload.query}"</span>
                <ExternalLink className="w-3-5 h-3-5" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Text Input Field */}
      <form onSubmit={handleSubmit} className="w-full relative flex items-center">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isListening ? 'Speak now... (voice input appears here)' : "Ask Charlie or type command (e.g., 'Open terminal', 'My name is Alex')..."}
          className="w-full bg-slate-950-90 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus-outline-none border-sky-500-50 font-sans"
        />
        <button
          type="submit"
          className="absolute right-2 p-2 rounded-lg bg-sky-500 text-slate-950 font-bold cursor-pointer"
          title="Send command"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}