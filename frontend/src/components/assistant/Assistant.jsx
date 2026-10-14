import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  MessageCircle, X, Send, Mic, MicOff, ShieldAlert,
  ChevronRight, CornerDownRight, RotateCcw, AlertTriangle, PhoneCall
} from 'lucide-react';
import { matchNeedToDepartment, checkEmergency } from './assistantMatcher.js';
import { api } from '../../lib/api.js';
import { useOrigin } from '../../lib/location.js';
import { storage } from '../../lib/storage.js';

const PROMPT_CHIPS = [
  'Book an eye checkup',
  'Which hospital is fastest for cardiology?',
  'I need to see a doctor for bone pain',
  'Where is the nearest hospital?',
];

export function Assistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userLocation] = useOrigin();

  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem('nq-assistant-dismissed') === 'true';
  });
  const [isIdleCollapsed, setIsIdleCollapsed] = useState(false);
  const [hospitals, setHospitals] = useState([]);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am NeverQ’s rule-based booking helper. Tell me your symptom or department need, and I will recommend the fastest hospital queue for you.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);

  const messagesEndRef = useRef(null);
  const idleTimerRef = useRef(null);

  // Hidden on staff/admin routes, public wait board, and join forms
  const pathname = location.pathname;
  const isHiddenRoute =
    pathname.startsWith('/staff') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/board') ||
    pathname.startsWith('/join');

  // Re-enable event listener from top bar menu
  useEffect(() => {
    const handleOpen = () => {
      setIsDismissed(false);
      localStorage.removeItem('nq-assistant-dismissed');
      setIsOpen(true);
    };
    window.addEventListener('nq-assistant-open', handleOpen);
    return () => window.removeEventListener('nq-assistant-open', handleOpen);
  }, []);

  // Load live hospitals list for matching
  useEffect(() => {
    if (isHiddenRoute || isDismissed) return;
    api.listOrgs()
      .then((data) => setHospitals(data || []))
      .catch((err) => console.warn('Assistant failed to fetch orgs:', err));
  }, [isHiddenRoute, isDismissed]);

  // Idle timer: collapses launcher to a minimal edge tab after 8 seconds
  useEffect(() => {
    if (isOpen || isDismissed || isHiddenRoute) return;

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsIdleCollapsed(true);
    }, 8000);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isOpen, isDismissed, isHiddenRoute]);

  // Scroll to bottom of message list on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Speech Recognition support (P2 Voice)
  const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

  const handleVoiceToggle = () => {
    if (!SpeechRecognition) return;

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.start();
    } catch (err) {
      console.warn('Voice recognition error:', err);
      setIsListening(false);
    }
  };

  const handleDismissLauncher = (e) => {
    e.stopPropagation();
    setIsDismissed(true);
    localStorage.setItem('nq-assistant-dismissed', 'true');
  };

  const handleSendMessage = useCallback((queryText) => {
    const text = (queryText || input).trim();
    if (!text) return;

    // Add user message
    const userMsg = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
    };

    // Run deterministic rule-based matcher with authoritative origin and travelMode
    const travelMode = storage.getTravelMode?.() || 'car';
    const result = matchNeedToDepartment(text, hospitals, userLocation, travelMode);

    const botMsg = {
      id: `a-${Date.now()}`,
      sender: 'assistant',
      text: result.message,
      data: result,
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput('');
  }, [input, hospitals, userLocation]);

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'assistant',
        text: 'Hello! I am NeverQ’s rule-based booking helper. Tell me your symptom or department need, and I will recommend the fastest hospital queue for you.',
      },
    ]);
  };

  if (isHiddenRoute || isDismissed) {
    return null;
  }

  return (
    <>
      {/* ───────────── Launcher Button (Bottom-Left) ───────────── */}
      {!isOpen && (
        <div
          className={`fixed bottom-16 lg:bottom-5 left-4 z-30 transition-all duration-300 flex items-center ${
            isIdleCollapsed ? 'opacity-85 translate-x-[-12px] hover:translate-x-0' : 'opacity-100'
          }`}
        >
          <div className="relative group flex items-center">
            <button
              type="button"
              onClick={() => {
                setIsOpen(true);
                setIsIdleCollapsed(false);
              }}
              className="w-11 h-11 rounded-full bg-[var(--surface)] text-[var(--brand)] border border-[var(--border)] shadow-[var(--shadow-lg)] hover:border-[var(--brand)] flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              aria-label="Open Guided booking helper"
              title="Guided booking helper (rule-based)"
            >
              <MessageCircle size={20} className="text-[var(--brand)]" />
              <span className="sr-only">Open Guided helper</span>
            </button>

            {/* Dismiss X button on hover */}
            <button
              type="button"
              onClick={handleDismissLauncher}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-faint)] hover:text-[var(--ink)] flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shadow-xs"
              aria-label="Dismiss helper"
              title="Hide helper"
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}

      {/* ───────────── Assistant Dialog / Bottom Sheet ───────────── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-end sm:justify-start pointer-events-none p-0 sm:p-4">
          <div
            className="pointer-events-auto w-full sm:w-[380px] max-h-[75dvh] sm:max-h-[560px] h-[75dvh] sm:h-[540px] bg-[var(--surface)] border border-[var(--border)] rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-sheet)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
            role="dialog"
            aria-label="Guided helper (rule-based)"
          >
            {/* Header */}
            <div className="p-3.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]/60 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[var(--brand)]/15 text-[var(--brand)] flex items-center justify-center">
                  <MessageCircle size={15} />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-xs text-[var(--ink)] flex items-center gap-1.5">
                    <span>Guided helper</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--ink-faint)]">
                      rule-based
                    </span>
                  </h3>
                  <span className="text-[10px] text-[var(--ink-faint)] block leading-tight">
                    Not medical advice
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors"
                  title="Clear chat"
                  aria-label="Clear chat"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors"
                  title="Close helper"
                  aria-label="Close helper"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 flex flex-col gap-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1.5 max-w-[88%] ${
                    msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'
                  }`}
                >
                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-[var(--brand)] text-white font-medium rounded-tr-xs'
                        : msg.data?.type === 'emergency'
                        ? 'bg-[var(--accent)]/15 border-2 border-[var(--accent)] text-[var(--ink)] font-semibold rounded-tl-xs'
                        : 'bg-[var(--surface-2)] text-[var(--ink)] rounded-tl-xs'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Emergency Safety Alert Card */}
                  {msg.data?.type === 'emergency' && (
                    <div className="w-full p-3 rounded-xl bg-[var(--accent)] text-white text-xs flex flex-col gap-2 mt-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <ShieldAlert size={16} />
                        <span>Emergency Assistance Required</span>
                      </div>
                      <p className="text-[11px] leading-tight opacity-95">
                        Please do not use remote queuing. Call emergency services immediately.
                      </p>
                      <a
                        href="tel:112"
                        className="touch-target py-1.5 px-3 rounded-lg bg-white text-[var(--accent)] font-extrabold text-center text-xs flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <PhoneCall size={14} /> Call 112 Emergency
                      </a>
                    </div>
                  )}

                  {/* Recommendation Confirmation Card (Phase C.3) */}
                  {msg.data?.type === 'recommendation' && msg.data?.hospital && (
                    <div className="w-full p-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs flex flex-col gap-2 mt-1">
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <span className="text-[10px] font-bold text-[var(--brand)] uppercase tracking-wider block">
                            Recommended Venue
                          </span>
                          <span className="font-heading font-extrabold text-xs text-[var(--ink)] block">
                            {msg.data.hospital.name}
                          </span>
                          <span className="text-[11px] text-[var(--ink-faint)]">
                            {msg.data.deptName}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] tnum shrink-0">
                          ~{msg.data.waitMid}m wait
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[var(--ink-faint)] pt-1 border-t border-[var(--border)]">
                        <span>Travel approx: ~{msg.data.travelMin} min</span>
                        <span className="font-semibold text-[var(--ink)] tnum">
                          Total: ~{msg.data.totalMin} min
                        </span>
                      </div>

                      {/* Confirm Action Button: Navigates to Join Queue */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          navigate(`/join/${msg.data.hospital.id}/${msg.data.dept.id}`);
                        }}
                        className="touch-target w-full mt-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs hover:opacity-95 transition-opacity"
                      >
                        <span>Open Join Form for {msg.data.deptName}</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompt Chips */}
            <div className="px-3 py-1.5 border-t border-[var(--border)]/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 bg-[var(--surface-2)]/30">
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSendMessage(chip)}
                  className="px-2.5 py-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--brand)] text-[11px] text-[var(--ink)] whitespace-nowrap shrink-0 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Input & Action Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="p-2.5 border-t border-[var(--border)] flex items-center gap-2 bg-[var(--surface)] shrink-0"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe symptom or need..."
                className="flex-1 h-9 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] font-medium outline-hidden focus:border-[var(--brand)]"
              />

              {/* Push-to-talk Voice Button (SpeechRecognition) */}
              {SpeechRecognition && (
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  className={`p-2 rounded-xl border transition-colors ${
                    isListening
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)] animate-pulse'
                      : 'bg-[var(--surface-2)] text-[var(--ink-faint)] hover:text-[var(--ink)] border-[var(--border)]'
                  }`}
                  title={isListening ? 'Listening...' : 'Voice input'}
                  aria-label="Voice input"
                >
                  {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}

              <button
                type="submit"
                disabled={!input.trim()}
                className="p-2 rounded-xl bg-[var(--brand)] text-white disabled:opacity-40 hover:opacity-95 transition-opacity"
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            </form>

            {/* Safety Disclaimer Footer */}
            <div className="px-3 py-1 bg-[var(--surface-2)] text-center text-[10px] text-[var(--ink-faint)] border-t border-[var(--border)]/40 shrink-0">
              Rule-based assistant. Not medical advice. For emergencies, call 112.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
