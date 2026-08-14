import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Wifi, 
  WifiOff, 
  EyeOff, 
  Music, 
  RefreshCw,
  AlertCircle,
  Search,
  ChevronRight,
  ChevronLeft,
  Sliders,
  Check,
  Radio,
  BookOpen,
  ListPlus,
  Trash2,
  Sparkles,
  ArrowRight,
  X
} from 'lucide-react';
import { Song, SongSection, Recueil, ProjectedData } from './types';
import { DEFAULT_SONGS } from './data/defaultSongs';

export default function App() {
  // Network Config
  const [serverIp, setServerIp] = useState<string>(() => {
    return localStorage.getItem('maandiko_server_ip') || (window.location.hostname || 'localhost');
  });
  const [serverPort, setServerPort] = useState<string>(() => {
    return localStorage.getItem('maandiko_server_port') || (window.location.port || '3000');
  });

  const [connected, setConnected] = useState<boolean>(false);
  const [showConnectionConfig, setShowConnectionConfig] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Real Data from PC Server
  const [recueils, setRecueils] = useState<Recueil[]>([]);
  const [selectedRecueilId, setSelectedRecueilId] = useState<string>('all');
  const [songs, setSongs] = useState<Song[]>([]);
  const [loadingSongs, setLoadingSongs] = useState<boolean>(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Worship Setlist / Programme
  const [programSongs, setProgramSongs] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('maandiko_remote_program');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState<'all' | 'program'>('all');

  // Live Projection State
  const [projectedData, setProjectedData] = useState<ProjectedData | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Build base HTTP URL from IP & Port
  const getServerHttpUrl = (ip: string, port: string) => {
    const cleanIp = ip.replace(/^https?:\/\//, '').trim();
    const isDomain = cleanIp.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(cleanIp);
    const protocol = window.location.protocol === 'https:' && isDomain ? 'https:' : 'http:';
    if (isDomain && (cleanIp.includes('run.app') || cleanIp.includes('localhost'))) {
      return `${protocol}//${cleanIp}${port && port !== '80' && port !== '443' && !cleanIp.includes(':') ? `:${port}` : ''}`;
    }
    return `${protocol}//${cleanIp}:${port || '3000'}`;
  };

  // Connect to PC Socket.IO and fetch real songs
  const connectSocket = (ip: string, port: string) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    setIsConnecting(true);
    setConnectionError(null);
    const serverUrl = getServerHttpUrl(ip, port);

    const newSocket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 6000
    });

    newSocket.on('connect', () => {
      setConnected(true);
      setIsConnecting(false);
      setConnectionError(null);
      localStorage.setItem('maandiko_server_ip', ip);
      localStorage.setItem('maandiko_server_port', port);
      // Fetch real data from server
      fetchRealData(serverUrl);
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      setIsConnecting(false);
    });

    newSocket.on('connect_error', () => {
      setConnected(false);
      setIsConnecting(false);
      setConnectionError(`Impossible de joindre le serveur sur ${serverUrl}. Vérifiez l'adresse IP du PC.`);
    });

    // Listen to real-time projection updates from PC or other remotes
    newSocket.on('afficher-paragraphe', (data: ProjectedData) => {
      setProjectedData(data);
      if (data && data.module === 'lyrics') {
        setActiveSectionId(data.numero ? `${data.numero}` : null);
      } else if (!data || !data.texte || data.sermonId === 'BLACK' || data.animPhase === 'EXITING') {
        setActiveSectionId(null);
      }
    });

    socketRef.current = newSocket;
  };

  // Fetch real recueils & songs via REST API
  const fetchRealData = async (baseUrl: string) => {
    setLoadingSongs(true);
    try {
      // 1. Fetch Recueils (try direct URL, fallback to relative proxy)
      let resRecueils = await fetch(`${baseUrl}/api/recueils`).catch(() => null);
      if (!resRecueils || !resRecueils.ok) {
        resRecueils = await fetch('/api/recueils').catch(() => null);
      }

      if (resRecueils && resRecueils.ok) {
        const dataRec: Recueil[] = await resRecueils.json();
        setRecueils(dataRec);
      }

      // 2. Fetch All Songs (try direct URL, fallback to relative proxy)
      let resSongs = await fetch(`${baseUrl}/api/songs`).catch(() => null);
      if (!resSongs || !resSongs.ok) {
        resSongs = await fetch('/api/songs').catch(() => null);
      }

      if (resSongs && resSongs.ok) {
        const dataSongs: Song[] = await resSongs.json();
        if (Array.isArray(dataSongs) && dataSongs.length > 0) {
          setSongs(dataSongs);
          setSelectedSong(prev => prev || dataSongs[0]);
        }
      }
    } catch (err) {
      console.warn("Info chargement chants:", err);
    } finally {
      setLoadingSongs(false);
    }
  };

  useEffect(() => {
    connectSocket(serverIp, serverPort);
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Save program to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('maandiko_remote_program', JSON.stringify(programSongs));
    } catch {
      // ignore
    }
  }, [programSongs]);

  // Project a section (Couplet / Refrain)
  const handleProjectSection = (song: Song, section: SongSection, index: number) => {
    const songTitle = `N° ${song.number} - ${song.title}`;
    const sectionLabel = section.label || `Couplet ${index + 1}`;

    const payload: ProjectedData = {
      sermonId: 'LYRICS',
      numero: sectionLabel,
      texte: section.text,
      estExtrait: false,
      titre_francais: songTitle,
      module: 'lyrics',
      animPhase: 'ENTERING',
      timestamp: Date.now()
    };

    setProjectedData(payload);
    setActiveSectionId(sectionLabel);

    if (socketRef.current && connected) {
      socketRef.current.emit('projeter-paragraphe', payload);
    }
  };

  // Black screen / Hide projection
  const handleClearProjection = () => {
    const payload: ProjectedData = {
      sermonId: 'BLACK',
      numero: '',
      texte: '',
      estExtrait: false,
      titre_francais: '',
      module: 'lyrics',
      animPhase: 'EXITING',
      timestamp: Date.now()
    };

    setProjectedData(payload);
    setActiveSectionId(null);

    if (socketRef.current && connected) {
      socketRef.current.emit('projeter-paragraphe', payload);
    }
  };

  // Navigate to Next / Prev Section in active song
  const handleNavigateSection = (direction: 'next' | 'prev') => {
    if (!selectedSong || !selectedSong.sections || selectedSong.sections.length === 0) return;
    const currentIndex = selectedSong.sections.findIndex(s => s.label === activeSectionId || (projectedData && projectedData.texte === s.text));
    
    let targetIndex = 0;
    if (currentIndex !== -1) {
      targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    } else {
      targetIndex = direction === 'next' ? 0 : selectedSong.sections.length - 1;
    }

    if (targetIndex >= 0 && targetIndex < selectedSong.sections.length) {
      handleProjectSection(selectedSong, selectedSong.sections[targetIndex], targetIndex);
    }
  };

  // Program Management
  const toggleProgram = (song: Song) => {
    setProgramSongs(prev => {
      const exists = prev.some(s => s.id === song.id);
      if (exists) {
        return prev.filter(s => s.id !== song.id);
      } else {
        return [...prev, song];
      }
    });
  };

  // Filtered songs
  const filteredSongs = useMemo(() => {
    const source = activeTab === 'program' ? programSongs : songs;
    let list = source;

    if (selectedRecueilId !== 'all' && activeTab !== 'program') {
      list = list.filter(s => s.recueil_id === selectedRecueilId);
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter(s => 
      s.number.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      (s.sections && s.sections.some(sec => sec.text.toLowerCase().includes(q)))
    );
  }, [songs, programSongs, selectedRecueilId, activeTab, searchQuery]);

  const isCurrentSectionLive = (section: SongSection) => {
    if (!projectedData || !projectedData.texte || projectedData.sermonId === 'BLACK') return false;
    return projectedData.texte.trim() === section.text.trim() || projectedData.numero === section.label;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      
      {/* 1. TOP HEADER */}
      <header className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border-b border-slate-800/90 shadow-lg flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-amber-500/15 rounded-xl border border-amber-500/30 text-amber-400">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wide text-slate-100 uppercase">MaAndiko Remote</h1>
            <p className="text-[10px] font-medium text-amber-400/90 flex items-center gap-1">
              <span>Régie Cantiques & Paroles</span>
              {songs.length > 0 && <span className="text-slate-400">• {songs.length} chants réels</span>}
            </p>
          </div>
        </div>

        {/* Connection status button */}
        <button 
          onClick={() => setShowConnectionConfig(!showConnectionConfig)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition shadow ${
            connected 
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30' 
              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
          }`}
        >
          {connected ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-rose-400" />}
          <span>{connected ? 'Connecté PC' : 'Connexion...'}</span>
        </button>
      </header>

      {/* 2. CONNECTION CONFIG DRAWER */}
      {showConnectionConfig && (
        <div className="bg-slate-900 border-b border-amber-500/40 p-4 shadow-2xl z-50 animate-in slide-in-from-top-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Adresse IP du PC Régie
            </h2>
            <button 
              onClick={() => setShowConnectionConfig(false)}
              className="p-1 hover:bg-slate-800 rounded-md text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mb-2">
            Entrez l'adresse IP affichée dans la fenêtre <strong>Partager</strong> de MaAndiko Studio sur votre PC.
          </p>

          <div className="flex gap-2 mb-2">
            <input 
              type="text" 
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              placeholder="Ex: 192.168.1.50"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-400"
            />
            <input 
              type="text" 
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              placeholder="3000"
              className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-400 text-center"
            />
            <button 
              onClick={() => connectSocket(serverIp, serverPort)}
              disabled={isConnecting}
              className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 text-slate-950 font-bold px-3 py-2 rounded-lg text-xs transition flex items-center gap-1 shadow"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
              <span>{isConnecting ? 'Test...' : 'Connecter'}</span>
            </button>
          </div>

          {connected && (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/30">
              <Check className="w-4 h-4" /> Connecté au PC ! Les cantiques réels sont synchronisés.
            </p>
          )}

          {connectionError && (
            <p className="text-[11px] text-rose-400 flex items-center gap-1.5 bg-rose-500/10 p-2 rounded-lg border border-rose-500/30 mt-1">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{connectionError}</span>
            </p>
          )}
        </div>
      )}

      {/* 3. LIVE MONITOR & RAPID PROJECTION CONTROLS */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-3.5 py-2 shadow-md flex items-center justify-between gap-2 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`w-2 h-2 rounded-full ${projectedData?.texte && projectedData?.sermonId !== 'BLACK' ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {projectedData?.texte && projectedData?.sermonId !== 'BLACK' ? 'En Direct sur Écran' : 'Écran Noir / Inactif'}
            </span>
          </div>
          <p className="text-xs font-bold text-amber-300 truncate">
            {projectedData?.titre_francais || 'Aucun cantique projeté'}
          </p>
          {projectedData?.numero && (
            <p className="text-[10px] font-mono text-slate-400 truncate">
              {projectedData.numero} • {projectedData.texte?.substring(0, 45)}...
            </p>
          )}
        </div>

        {/* Quick actions: Prev / Next / Black */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button 
            onClick={() => handleNavigateSection('prev')}
            className="p-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-650 text-slate-200 rounded-lg text-xs font-bold border border-slate-700 transition"
            title="Strophe précédente"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            onClick={() => handleNavigateSection('next')}
            className="p-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-650 text-slate-200 rounded-lg text-xs font-bold border border-slate-700 transition"
            title="Strophe suivante"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button 
            onClick={handleClearProjection}
            className="flex items-center gap-1 px-2.5 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow"
            title="Masquer l'écran (Écran noir)"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Masquer</span>
          </button>
        </div>
      </div>

      {/* 4. TABS: ALL SONGS VS WORSHIP PROGRAM */}
      <div className="flex items-center bg-slate-900/60 border-b border-slate-800 px-3 pt-2 gap-2 flex-shrink-0">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-bold transition border-t border-x ${
            activeTab === 'all'
              ? 'bg-slate-950 text-amber-400 border-slate-800'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Tous les Cantiques ({songs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('program')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-bold transition border-t border-x ${
            activeTab === 'program'
              ? 'bg-slate-950 text-amber-400 border-slate-800'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <ListPlus className="w-3.5 h-3.5" />
          <span>Programme ({programSongs.length})</span>
        </button>
      </div>

      {/* 5. SEARCH & RECUEILS FILTER BAR */}
      <div className="p-3 bg-slate-950 border-b border-slate-800/80 space-y-2 flex-shrink-0">
        <div className="flex gap-2">
          {/* Recueils Dropdown */}
          {recueils.length > 0 && activeTab === 'all' && (
            <select
              value={selectedRecueilId}
              onChange={(e) => setSelectedRecueilId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400 max-w-[130px]"
            >
              <option value="all">Tous recueils</option>
              {recueils.map(r => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          )}

          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par numéro (ex: 45) ou titre..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Quick Horizontal Song Selector if searching or viewing list */}
        {filteredSongs.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {filteredSongs.slice(0, 15).map(song => {
              const isSelected = selectedSong?.id === song.id;
              const inProg = programSongs.some(p => p.id === song.id);
              return (
                <button
                  key={song.id}
                  onClick={() => setSelectedSong(song)}
                  className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition border flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md ring-1 ring-amber-400'
                      : 'bg-slate-900 hover:bg-slate-850 text-slate-200 border-slate-800'
                  }`}
                >
                  <span>N° {song.number}</span>
                  <span className="font-normal truncate max-w-[100px]">{song.title}</span>
                  {inProg && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. MAIN BODY: SELECTED SONG STANZAS / CARDS */}
      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {loadingSongs ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-xs space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
            <p>Chargement des cantiques depuis le PC...</p>
          </div>
        ) : selectedSong ? (
          <div className="space-y-3">
            {/* Song Header Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-black">
                    N° {selectedSong.number}
                  </span>
                  <h2 className="text-sm font-extrabold text-slate-100 truncate">
                    {selectedSong.title}
                  </h2>
                </div>
                {selectedSong.category && (
                  <p className="text-[10px] text-slate-400 mt-0.5">{selectedSong.category}</p>
                )}
              </div>

              {/* Add to Program Button */}
              <button
                onClick={() => toggleProgram(selectedSong)}
                className={`p-2 rounded-xl text-xs font-bold border transition flex items-center gap-1 ${
                  programSongs.some(p => p.id === selectedSong.id)
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                }`}
                title="Ajouter / Retirer du programme du culte"
              >
                <ListPlus className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {programSongs.some(p => p.id === selectedSong.id) ? 'Au Programme' : '+ Programme'}
                </span>
              </button>
            </div>

            {/* STANZAS & CHORUSES CARDS */}
            <div className="space-y-2.5">
              {selectedSong.sections && selectedSong.sections.length > 0 ? (
                selectedSong.sections.map((section, idx) => {
                  const live = isCurrentSectionLive(section);
                  const isChorus = (section.type || '').toLowerCase().includes('refrain') || (section.label || '').toLowerCase().includes('refrain');

                  return (
                    <div
                      key={section.id || idx}
                      onClick={() => handleProjectSection(selectedSong, section, idx)}
                      className={`relative p-3.5 rounded-xl border transition-all duration-150 cursor-pointer shadow-sm overflow-hidden ${
                        live
                          ? 'bg-emerald-950/80 border-emerald-400 ring-2 ring-emerald-500/50 shadow-emerald-950/50'
                          : isChorus
                          ? 'bg-slate-900/95 hover:bg-slate-850 border-rose-500/30'
                          : 'bg-slate-900/90 hover:bg-slate-850 border-slate-800'
                      }`}
                    >
                      {/* Left accent bar */}
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1.5"
                        style={{ backgroundColor: section.color || (isChorus ? '#e11d48' : '#2563eb') }}
                      />

                      {/* Header of the Stanza Card */}
                      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: section.color || (isChorus ? '#e11d48' : '#2563eb') }}
                          />
                          <span className={`text-xs font-black uppercase tracking-wider ${isChorus ? 'text-rose-400' : 'text-sky-400'}`}>
                            {section.label || (isChorus ? 'Refrain' : `Couplet ${idx + 1}`)}
                          </span>
                        </div>

                        {live ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black animate-pulse">
                            <Radio className="w-3 h-3 text-emerald-400" />
                            <span>DIRECT</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-semibold group-hover:text-amber-400">
                            Toucher pour projeter
                          </span>
                        )}
                      </div>

                      {/* Stanza Lyrics */}
                      <p className="whitespace-pre-line text-xs leading-relaxed text-slate-200 font-serif pl-1">
                        {section.text}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-900 rounded-xl border border-slate-800">
                  Ce cantique n'a pas encore de strophes découpées.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center text-slate-500 text-xs space-y-3">
            <Music className="w-12 h-12 text-slate-700" />
            <p>Sélectionnez un cantique dans la liste ci-dessus pour afficher et projeter ses paroles.</p>
          </div>
        )}
      </main>

      {/* 7. BOTTOM BAR QUICK SWITCHER */}
      <footer className="bg-slate-900 border-t border-slate-800 px-3.5 py-2 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
        <span className="font-mono text-[11px]">
          {filteredSongs.length} cantiques affichés
        </span>
        <button 
          onClick={() => connectSocket(serverIp, serverPort)}
          className="flex items-center gap-1 text-amber-400 font-bold hover:underline"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Synchroniser PC
        </button>
      </footer>

    </div>
  );
}
