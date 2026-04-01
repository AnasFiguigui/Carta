import React, { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../lib/store';
import { getSocket } from '../lib/socket';

export default function ChatPanel() {
  const messages = useGameStore((s) => s.chatMessages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    const msg = input.trim();
    if (!msg) return;
    getSocket().emit('chat-message', { message: msg });
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-black/40 rounded-lg border border-white/10">
      <div className="px-3 py-2 border-b border-white/10 text-sm font-bold text-white/80">
        💬 Chat
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 chat-scroll space-y-1" style={{ maxHeight: 250 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`text-xs ${msg.isSystem ? 'text-[#6E13E7]/70 italic' : 'text-white/90'}`}>
            {!msg.isSystem && (
              <span className="font-bold text-[#6E13E7] mr-1">{msg.playerName}:</span>
            )}
            <span>{msg.message}</span>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-xs text-white/30 text-center py-4">No messages yet</div>
        )}
      </div>

      <div className="flex border-t border-white/10">
        <input
          className="flex-1 bg-transparent text-white text-xs px-3 py-2 outline-none placeholder-white/30"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          maxLength={200}
        />
        <button
          className="px-3 text-xs text-[#6E13E7] hover:text-[#7E2BF7] transition-colors"
          onClick={sendMessage}
        >
          Send
        </button>
      </div>
    </div>
  );
}
