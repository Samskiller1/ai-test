/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, Send, Volume2, VolumeX, Terminal, 
  LayoutGrid, Gamepad2, MessageSquare, 
  Trash2, Palette, Zap, Monitor, LogOut, User as UserIcon
} from 'lucide-react';

// --- Types ---
interface Message {
  sender: 'user' | 'liz' | 'system';
  text: string;
  isImage?: boolean;
}

interface User {
  username: string;
  token: string;
}

// --- Constants ---
const THEMES = ['theme-solar', 'theme-ocean', 'theme-forest', 'theme-royal', ''];
const EMOJIS = ['✨', '🚀', '💻', '🔥', '🤖', '💖', '👀', '💅', '🎮', '🧠'];

export default function App() {
  // --- State ---
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'apps' | 'games'>('chat');
  const [isMuted, setIsMuted] = useState(false);
  const [convoMode, setConvoMode] = useState(false);
  const [matrixActive, setMatrixActive] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [glitchMode, setGlitchMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);
  const [terminalContent, setTerminalContent] = useState('System initializing...\n> Accessing Liz Core...\n> Connected.\n_');

  // --- Refs ---
  const chatEndRef = useRef<HTMLDivElement>(null);
  const matrixCanvasRef = useRef<HTMLCanvasElement>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // --- Initialization ---
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    synthRef.current = window.speechSynthesis;
    initSpeechRecognition();
    return () => {
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (matrixActive) startMatrix();
  }, [matrixActive]);

  useEffect(() => {
    if (convoMode) startVisualizer();
    else stopVisualizer();
  }, [convoMode]);

  // --- Auth Actions ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auth failed');
      
      if (authMode === 'login') {
        setUser(data);
        localStorage.setItem('user', JSON.stringify(data));
      } else {
        setAuthMode('login');
        setError('Registration successful. Please login.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setMessages([]);
  };

  // --- Chat Actions ---
  const fetchHistory = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/chat/history', {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  };

  const saveMessage = async (msg: Message) => {
    if (!user) return;
    try {
      await fetch('/api/chat/save', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ message: msg }),
      });
    } catch (err) {
      console.error('Failed to save message', err);
    }
  };

  const addMessage = (text: string, sender: 'user' | 'liz' | 'system', isImage = false) => {
    const newMsg: Message = { text, sender, isImage };
    setMessages(prev => [...prev, newMsg]);
    if (sender !== 'system') saveMessage(newMsg);
    if (sender === 'liz' && !isMuted) speak(text);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    addMessage(text, 'user');
    await processInput(text);
  };

  const processInput = async (text: string) => {
    setLoading(true);
    const lower = text.toLowerCase();

    // Local Commands
    if (lower === 'clear') {
      await fetch('/api/chat/clear', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user?.token}` }
      });
      setMessages([]);
      setLoading(false);
      return;
    }

    if (lower.includes('convo mode')) {
      setConvoMode(!convoMode);
      addMessage(convoMode ? "Conversation mode disabled." : "Conversation mode active. I'm all ears. 🎙️", 'liz');
      setLoading(false);
      return;
    }

    if (lower.includes('matrix mode')) {
      setMatrixActive(!matrixActive);
      addMessage(matrixActive ? "Matrix disconnected." : "Entering the Matrix.", 'liz');
      setLoading(false);
      return;
    }

    if (lower.includes('hacker terminal')) {
      setTerminalOpen(true);
      addMessage("Accessing root mainframe...", 'liz');
      setLoading(false);
      return;
    }

    if (lower.includes('cyber psychosis')) {
      setGlitchMode(!glitchMode);
      addMessage("Reality distorted.", 'liz');
      setLoading(false);
      return;
    }

    if (lower.includes('theme roulette')) {
      const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
      document.body.className = theme;
      addMessage("Visual theme reconfigured.", 'liz');
      setLoading(false);
      return;
    }

    if (lower.includes('set timer')) {
      const num = parseInt(text.match(/\d+/)?.[0] || '0');
      if (num > 0) {
        setTimer(num);
        const interval = setInterval(() => {
          setTimer(prev => {
            if (prev && prev <= 1) {
              clearInterval(interval);
              addMessage("Timer complete! 🚨", 'liz');
              return null;
            }
            return prev ? prev - 1 : null;
          });
        }, 1000);
        addMessage(`Timer set for ${num} seconds. ⏳`, 'liz');
      } else {
        addMessage("Please specify a valid time.", 'liz');
      }
      setLoading(false);
      return;
    }

    // Image Gen
    if (lower.startsWith('generate') || lower.startsWith('draw') || lower.startsWith('create image')) {
      try {
        const prompt = text.replace(/^(generate|draw|create image)\s+/i, '');
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instances: [{ prompt }] }),
        });
        const data = await res.json();
        if (data.imageBase64) {
          addMessage(`data:image/png;base64,${data.imageBase64}`, 'liz', true);
        } else {
          addMessage("Visual render failed.", 'liz');
        }
      } catch (err) {
        addMessage("Critical error in image generation.", 'liz');
      }
      setLoading(false);
      return;
    }

    // AI Text
    try {
      const history = messages.slice(-5).map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));
      const res = await fetch('/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [...history, { role: 'user', parts: [{ text }] }],
          systemInstruction: { parts: [{ text: "You are Liz, Admin of JOINT HUB. Created by Skiller. You are intelligent, lively, and respect Skiller. Short answers preferred. Secret code: 254." }] }
        }),
      });
      const data = await res.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Data corruption detected.";
      const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      addMessage(responseText + " " + emoji, 'liz');
    } catch (err) {
      addMessage("A critical system error occurred.", 'liz');
    }
    setLoading(false);
  };

  // --- Features Implementation ---
  const startMatrix = () => {
    const canvas = matrixCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const cols = Math.floor(canvas.width / 20);
    const ypos = Array(cols).fill(0);

    const interval = setInterval(() => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f0';
      ctx.font = '15pt monospace';
      ypos.forEach((y, i) => {
        const text = String.fromCharCode(Math.random() * 128);
        ctx.fillText(text, i * 20, y);
        if (y > 100 + Math.random() * 10000) ypos[i] = 0;
        else ypos[i] = y + 20;
      });
    }, 50);

    return () => clearInterval(interval);
  };

  const startVisualizer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const draw = () => {
        if (!analyserRef.current || !visualizerCanvasRef.current) return;
        requestAnimationFrame(draw);
        const canvas = visualizerCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = dataArray[i] / 2;
          ctx.fillStyle = `rgb(${barHeight + 100}, 50, 200)`;
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
      };
      draw();
    } catch (err) {
      console.error('Visualizer error', err);
    }
  };

  const stopVisualizer = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  const initSpeechRecognition = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const transcript = e.results[e.results.length - 1][0].transcript.trim();
      if (convoMode) {
        addMessage(transcript, 'user');
        processInput(transcript);
      }
    };
    recognition.onend = () => {
      if (isListening) recognition.start();
    };
    recognitionRef.current = recognition;
  };

  const toggleMic = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const speak = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const cleanText = text.replace(/[*#]/g, "").replace(/!\[.*?\]\(.*?\)/g, "Image generated.");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.pitch = 1.15;
    utterance.rate = 1.1;
    synthRef.current.speak(utterance);
  };

  // --- Render Helpers ---
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="main-card p-8 rounded-2xl w-full max-w-md"
        >
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black tracking-tighter mb-2" style={{ color: 'var(--primary)', textShadow: '0 0 10px var(--primary)' }}>JOINT HUB</h1>
            <p className="text-xs opacity-60 uppercase tracking-widest">System Access Required</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-bold mb-1 opacity-70">USERNAME</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-3 rounded-xl bg-black/30 border border-white/10 focus:border-primary focus:outline-none transition"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 opacity-70">PASSWORD</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded-xl bg-black/30 border border-white/10 focus:border-primary focus:outline-none transition"
                required
              />
            </div>
            {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
            <button 
              type="submit"
              className="w-full p-4 rounded-xl font-bold transition hover:scale-105"
              style={{ backgroundColor: 'var(--primary)', color: 'white' }}
            >
              {authMode === 'login' ? 'INITIALIZE SESSION' : 'REGISTER CORE'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-xs opacity-60 hover:opacity-100 transition underline"
            >
              {authMode === 'login' ? 'Need a core identity? Register' : 'Already have an identity? Login'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`p-4 flex flex-col items-center h-screen ${glitchMode ? 'mode-glitch' : ''}`}>
      {matrixActive && <canvas ref={matrixCanvasRef} className="matrix-canvas" />}
      
      {/* Header */}
      <header className="w-full max-w-6xl flex flex-wrap justify-between items-center py-3 px-4 mb-4 border-b-2 border-primary bg-opacity-50 backdrop-blur-md z-10 rounded-xl main-card">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-secondary animate-pulse"></div>
          <span className="text-2xl md:text-3xl font-extrabold tracking-widest" style={{ color: 'var(--primary)', textShadow: '0 0 10px var(--primary)' }}>JOINT HUB</span>
          <span className="text-xs md:text-sm hidden sm:block" style={{ color: 'var(--secondary)' }}>| SYSTEM ONLINE</span>
        </div>
        
        <nav className="flex space-x-2 mt-2 sm:mt-0">
          <button onClick={() => setView('chat')} className={`btn-nav px-4 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 ${view === 'chat' ? 'active' : ''}`}>
            <MessageSquare size={16} /> LIZ
          </button>
          <button onClick={() => setView('games')} className={`btn-nav px-4 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 ${view === 'games' ? 'active' : ''}`}>
            <Gamepad2 size={16} /> GAMES
          </button>
          <button onClick={() => setView('apps')} className={`btn-nav px-4 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-2 ${view === 'apps' ? 'active' : ''}`}>
            <LayoutGrid size={16} /> APPS
          </button>
          <button onClick={() => setIsMuted(!isMuted)} className="btn-nav px-3 py-2 rounded-lg text-lg">
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <div className="w-full max-w-6xl flex flex-col md:flex-row flex-grow gap-4 overflow-hidden z-10">
        
        {/* Sidebar */}
        <aside className="w-full md:w-64 flex flex-col gap-3">
          <div className="main-card p-4 rounded-xl">
            <h3 className="text-xs font-bold opacity-70 mb-2" style={{ color: 'var(--secondary)' }}>SYSTEM STATUS</h3>
            {timer !== null && (
              <div className="bg-black/30 p-2 rounded border border-dashed border-primary text-center font-mono text-xl mb-2 animate-pulse">
                ⏳ {timer}s ⏰
              </div>
            )}
            {convoMode && (
              <div className="text-xs font-bold text-center p-1 rounded bg-red-600 text-white border border-red-400 mb-2 animate-pulse">
                🎙️ LIVE MODE
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <div className="flex items-center gap-1"><UserIcon size={12} /> {user.username}</div>
              <button onClick={handleLogout} className="hover:text-red-500 transition"><LogOut size={12} /></button>
            </div>
          </div>

          <div className="main-card p-4 rounded-xl flex-grow flex flex-col gap-2 overflow-y-auto">
            <h3 className="text-xs font-bold opacity-70 mb-1" style={{ color: 'var(--secondary)' }}>QUICK COMMANDS</h3>
            <button onClick={() => processInput('convo mode')} className="btn-nav p-2 rounded text-left text-xs flex items-center gap-2"><Zap size={14} /> Toggle Convo Mode</button>
            <button onClick={() => processInput('matrix mode')} className="btn-nav p-2 rounded text-left text-xs flex items-center gap-2"><Monitor size={14} /> Matrix Mode</button>
            <button onClick={() => processInput('theme roulette')} className="btn-nav p-2 rounded text-left text-xs flex items-center gap-2"><Palette size={14} /> Theme Roulette</button>
            <button onClick={() => processInput('cyber psychosis')} className="btn-nav p-2 rounded text-left text-xs flex items-center gap-2"><Zap size={14} /> Cyber Psychosis</button>
            <button onClick={() => processInput('hacker terminal')} className="btn-nav p-2 rounded text-left text-xs flex items-center gap-2"><Terminal size={14} /> Hacker Terminal</button>
            <button onClick={() => processInput('clear')} className="btn-nav p-2 rounded text-left text-xs flex items-center gap-2"><Trash2 size={14} /> Clear Chat</button>
          </div>
        </aside>

        {/* View Content */}
        <main className="flex-grow flex flex-col h-full main-card rounded-xl overflow-hidden relative">
          {view === 'chat' && (
            <>
              <div className="p-3 border-b border-white/10 flex justify-between items-center bg-black/20">
                <span className="font-bold text-sm tracking-wider">LIZ CORE INTERFACE</span>
                {loading && (
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-150"></div>
                  </div>
                )}
              </div>

              {convoMode && (
                <div className="px-4 pt-2">
                  <canvas ref={visualizerCanvasRef} id="visualizer-container"></canvas>
                </div>
              )}

              <div className="flex-grow overflow-y-auto p-4 space-y-4 relative">
                {messages.map((msg, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`${msg.sender === 'user' ? 'user-bubble' : 'liz-bubble'} p-3 rounded-xl max-w-[85%] text-sm md:text-base shadow-lg backdrop-blur-sm`}>
                      <span className="text-xs font-bold opacity-70 mb-1 block" style={{ color: msg.sender === 'user' ? 'var(--secondary)' : 'var(--primary)' }}>
                        {msg.sender === 'user' ? 'YOU' : 'LIZ'}
                      </span>
                      {msg.isImage ? (
                        <img src={msg.text} className="generated-image" alt="Generated" />
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      )}
                    </div>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 border-t border-white/10 bg-black/20">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={toggleMic}
                    className={`p-3 rounded-full bg-white/10 hover:bg-white/20 transition w-12 h-12 flex-shrink-0 flex items-center justify-center border border-white/20 ${isListening ? 'mic-active' : ''}`}
                  >
                    <Mic size={20} />
                  </button>
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Command Liz..." 
                    className="flex-grow p-3 rounded-xl bg-black/30 border border-white/10 focus:border-primary focus:outline-none text-white transition"
                  />
                  <button 
                    onClick={handleSend}
                    className="p-3 rounded-xl font-bold w-20 transition hover:scale-105" 
                    style={{ backgroundColor: 'var(--primary)', color: 'white' }}
                  >
                    SEND
                  </button>
                </div>
              </div>
            </>
          )}

          {view === 'apps' && (
            <div className="p-8 text-center">
              <h2 className="text-4xl font-bold mb-8" style={{ color: 'var(--primary)' }}>JOINT HUB APPS</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {['📅 Scheduler', '🎵 Music Player', '📁 Files', '⚙️ Settings'].map(app => (
                  <div key={app} className="p-6 bg-white/5 rounded-xl hover:bg-white/10 cursor-pointer border border-white/10 transition">
                    {app}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'games' && (
            <div className="p-8 text-center">
              <h2 className="text-4xl font-bold mb-8" style={{ color: 'var(--secondary)' }}>GAME CENTER</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button className="p-8 bg-gradient-to-br from-purple-900 to-black rounded-xl hover:scale-105 transition border border-purple-500">
                  <h3 className="text-2xl font-bold">Truth or Dare</h3>
                  <p className="text-sm opacity-70">The Classic Party Game</p>
                </button>
                <button className="p-8 bg-gradient-to-br from-emerald-900 to-black rounded-xl hover:scale-105 transition border border-emerald-500">
                  <h3 className="text-2xl font-bold">Cyber Poker</h3>
                  <p className="text-sm opacity-70">High Stakes Hacking</p>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Terminal Overlay */}
      <AnimatePresence>
        {terminalOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="hacker-terminal shadow-2xl rounded-lg overflow-hidden"
          >
            <div className="border-b border-green-500 pb-2 mb-2 flex justify-between items-center">
              <span className="font-bold">JOINT_HUB ROOT ACCESS</span>
              <button onClick={() => setTerminalOpen(false)} className="text-red-500 font-bold hover:bg-red-500/20 px-2 rounded">X</button>
            </div>
            <div className="h-full overflow-y-auto whitespace-pre-wrap font-mono text-sm">
              {terminalContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
