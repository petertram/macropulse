import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, Key } from 'lucide-react';
import Markdown from 'react-markdown';

interface ChatbotProps {
  fredData: any[];
  historyData: any[];
  scorecardConfig: any[];
  appendixData: any[];
}

export function Chatbot({ fredData, historyData, scorecardConfig, appendixData }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
    { role: 'model', text: 'Hello! I am your AI macro assistant. I can help you understand the scorecard factors, summarize the current status, or explain past performance. How can I help?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chatRef = useRef<any>(null);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const currentStatus = fredData.map(d => `${d.id}: ${d.value} (Date: ${d.date})`).join('\n');
      const factorsContext = scorecardConfig.map(c => `${c.name} (${c.id}): ${c.desc}`).join('\n');
      const appendixContext = appendixData.map(a => `${a.name} (${a.id}): ${a.desc}`).join('\n');
      const recentHistory = historyData.slice(-5).map(h =>
        `Date: ${h.date}, Return Diff: ${h.return_diff}%, Score: ${h.score || 'N/A'}, US10Y Fwd: ${h.us10y_fwd}%, SPX Fwd: ${h.spx_fwd}%`
      ).join('\n');

      const systemInstruction = `You are an expert macro-economic AI assistant for the "Flight to Safety" macro app. 
Your goal is to help users understand the factors driving the model, summarize current market conditions, and explain historical performance.

Context about the model:
The model predicts whether US 10-Year Treasury Bonds will outperform the S&P 500 over a forward period (e.g., 12 months).
It uses a "Flight to Safety" scorecard based on several macro factors.

Factors and Definitions:
${factorsContext}

Detailed Appendix:
${appendixContext}

Current Market Data (FRED):
${currentStatus}

Recent Historical Performance (Last 5 periods):
${recentHistory}

Guidelines:
- Be concise, professional, and analytical.
- Use the provided data to answer questions about current status or recent trends.
- If asked about a specific factor, explain it clearly using the appendix definitions.
- Format your responses using Markdown for readability (e.g., bolding key terms, using bullet points).
- Do not make definitive financial predictions or give investment advice; focus on explaining the model's inputs and historical relationships.`;

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMessage,
          systemInstruction,
          history: messages.slice(1).map(m => ({
            role: m.role,
            text: m.text
          })),
          userKey: localStorage.getItem('user_gemini_api_key') || ''
        })
      });

      const data = await response.json();

      if (data.error) {
        const errorStr = JSON.stringify(data.error).toLowerCase();
        if (errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('exhausted')) {
          setIsQuotaError(true);
          return;
        }
        throw new Error(data.error);
      }

      setMessages(prev => [...prev, { role: 'model', text: data.text || 'No response.' }]);
    } catch (error: any) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'model', text: `Sorry, I encountered an error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryWithKey = () => {
    if (tempApiKey.trim()) {
      localStorage.setItem('user_gemini_api_key', tempApiKey.trim());
      setIsQuotaError(false);
      handleSend();
    }
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 z-50 ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* Chat Window */}
      <div
        className={`fixed bottom-6 right-6 w-[380px] h-[600px] max-h-[80vh] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 z-50 origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="h-16 border-b border-white/10 bg-[#141414] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center border border-indigo-500/30">
              <Bot className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Macro Assistant</h3>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Online
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#050505]">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-white/10' : 'bg-indigo-500/20 border border-indigo-500/30'}`}>
                {msg.role === 'user' ? <User className="w-4 h-4 text-white/70" /> : <Bot className="w-4 h-4 text-indigo-400" />}
              </div>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-[#141414] text-white/80 border border-white/5 rounded-tl-sm'}`}>
                {msg.role === 'user' ? (
                  msg.text
                ) : (
                  <div className="markdown-body prose prose-invert prose-sm max-w-none">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isQuotaError && (
            <div className="flex flex-col gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2 text-rose-400">
                <Bot className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Shared Quota Exceeded</span>
              </div>
              <p className="text-[11px] text-red-100/60 leading-relaxed font-mono">
                The bot is currently unavailable due to shared server limits. Provide your own key to continue this thread.
              </p>
              <div className="space-y-2 pt-1">
                <input
                  type="password"
                  placeholder="Paste Google AI Key..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleRetryWithKey}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Key className="w-3 h-3" />
                    Retry Message
                  </button>
                  <button
                    onClick={() => setIsQuotaError(false)}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 rounded-lg text-xs font-medium transition-all"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="bg-[#141414] border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                <span className="text-xs text-white/50 font-mono">Analyzing data...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-[#141414] border-t border-white/10 shrink-0">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about factors, trends, or performance..."
              className="w-full bg-[#050505] border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 w-8 h-8 flex items-center justify-center text-white/50 hover:text-indigo-400 disabled:opacity-50 disabled:hover:text-white/50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
