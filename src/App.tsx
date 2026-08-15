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
  X, 
  Layers, 
  ExternalLink,
  Laptop
} from 'lucide-react';
import { Song, SongSection, Recueil, ProjectedData } from './types';

export default function App() {
  // Network Configuration
  const [serverIp, setServerIp] = useState<string>(() => {
    return localStorage.getItem('maandiko_server_ip') || (window.location.hostname || '');
  });
  const [serverPort, setServerPort] = useState<string>(() => {
    return localStorage.getItem('maandiko_server_port') || (window.location.port || '3000');
  });

  const [connected, setConnected] = useState<boolean>(false);
  const [showConnectionConfig, setShowConnectionConfig] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Synchronized Data from PC Régie (100% Dynamic from PC)
  const [recueils, setRecueils] = useState<Recueil[]>([]);
  const [selectedRecueilId, setSelectedRecueilId] = useState<string>('all');
  const [songs, setSongs] = useState<Song[]>([]);
  const [loadingSongs, setLoadingSongs] = useState<boolean>(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSongPickerModal, setShowSongPickerModal] = useState<boolean>(false);

  // Worship Setlist / Programme (Local to remote session)
  const [programSongs, setProgramSongs] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('maandiko_remote_program');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState<'all' | 'program'>('all');

  // Live Projection State from PC Régie
  const [projectedData, setProjectedData] = useState<ProjectedData | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Normalize song object
  const normalizeSongs = (rawSongs: any[]): Song[] => {
    if (!Array.isArray(rawSongs)) return [];
    return rawSongs.map(s => {
      let sections = s.sections;
      if (typeof sections === 'string') {
        try {
          sections = JSON.parse(sections);
        } catch {
          sections = [];
        }
      }
      return {
        id: s.id || `song-${s.number || Date.now()}`,
        recueil_id: s.recueil_id || 'ce',
        number: `${s.number || ''}`,
        title: s.title || 'Sans titre',
        category: s.category || '',
        author: s.author || '',
        keySignature: s.keySignature || s.key_signature || '',
        sections: Array.isArray(sections) ? sections : []
      };
    });
  };

  // Build clean server HTTP URL
  const getServerHttpUrl = (ipInput: string, portInput: string) => {
    let clean = (ipInput || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    let port = (portInput || '3000').trim();

    if (!clean) {
      clean = window.location.hostname || 'localhost';
    }

    if (clean.includes(':')) {
      const parts = clean.split(':');
      clean = parts[0];
      port = parts[1] || port;
    }

    if (clean.includes('run.app')) {
      return `https://${clean}`;
    }

    return `http://${clean}:${port || '3000'}`;
  };

  // Connect to PC Socket.IO and pull all songs & recueils from PC
  const connectSocket = (ip: string, port: string) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    setIsConnecting(true);
    setConnectionError(null);
    const serverUrl = getServerHttpUrl(ip, port);

    const newSocket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: 25,
      reconnectionDelay: 1000,
      timeout: 10000,
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      setConnected(true);
      setIsConnecting(false);
      setConnectionError(null);
      setLastSyncTime(new Date().toLocaleTimeString());
      localStorage.setItem('maandiko_server_ip', ip);
      localStorage.setItem('maandiko_server_port', port);

      // 1. Demande prioritaire des données via WebSocket avec accusé de réception
      setLoadingSongs(true);
      newSocket.emit('demander-chants', (dataSongs: any[]) => {
        if (Array.isArray(dataSongs)) {
          const normalized = normalizeSongs(dataSongs);
          setSongs(normalized);
          setSelectedSong(prev => {
            if (!prev && normalized.length > 0) return normalized[0];
            const found = normalized.find(s => s.id === prev?.id);
            return found || (normalized.length > 0 ? normalized[0] : null);
          });
          setLoadingSongs(false);
        }
      });

      newSocket.emit('demander-recueils', (dataRecs: Recueil[]) => {
        if (Array.isArray(dataRecs)) {
          setRecueils(dataRecs);
        }
      });

      // 2. Requête HTTP REST de secours
      fetchDataFromPC(serverUrl);
    });

    newSocket.on('liste-recueils', (data: Recueil[]) => {
      if (Array.isArray(data)) {
        setRecueils(data);
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    });

    newSocket.on('liste-chants', (data: any[]) => {
      if (Array.isArray(data)) {
        const normalized = normalizeSongs(data);
        setSongs(normalized);
        setSelectedSong(prev => {
          if (!prev && normalized.length > 0) return normalized[0];
          const found = normalized.find(s => s.id === prev?.id);
          return found || (normalized.length > 0 ? normalized[0] : null);
        });
        setLoadingSongs(false);
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    });

    newSocket.on('song-updated', (song: any) => {
      if (song && song.id) {
        const normalized = normalizeSongs([song])[0];
        setSongs(prev => {
          const idx = prev.findIndex(s => s.id === normalized.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = normalized;
            return next;
          }
          return [normalized, ...prev];
        });
        setSelectedSong(prev => (prev?.id === normalized.id ? normalized : prev));
      }
    });

    newSocket.on('song-deleted', (songId: string) => {
      if (songId) {
        setSongs(prev => prev.filter(s => s.id !== songId));
        setSelectedSong(prev => (prev?.id === songId ? null : prev));
      }
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      setIsConnecting(false);
    });

    newSocket.on('connect_error', () => {
      setConnected(false);
      setIsConnecting(false);
      setConnectionError(`Impossible de joindre le PC sur ${serverUrl}. Vérifiez l'adresse IP affichée sur la régie.`);
    });

    // Écoute de l'état actuel de projection sur la régie
    newSocket.on('afficher-paragraphe', (data: ProjectedData) => {
      setProjectedData(data);
      if (data && data.module === 'lyrics') {
        setActiveSectionId(data.numero ? `${data.numero}` : null);
      } else if (!data || !data.texte || data.sermonId === 'BLACK' || data.animPhase === 'EXITING' || data.animPhase === 'OUT') {
        setActiveSectionId(null);
      }
    });

    socketRef.current = newSocket;
  };

  // Requête REST HTTP pour récupérer les cantiques de la régie
  const fetchDataFromPC = async (baseUrl: string) => {
    try {
      // 1. Recueils
      const ctrlRec = new AbortController();
      const tRec = setTimeout(() => ctrlRec.abort(), 4000);
      try {
        let resRec = await fetch(`${baseUrl}/api/recueils`, { signal: ctrlRec.signal, cache: 'no-cache' }).catch(() => null);
        if (!resRec || !resRec.ok) {
          resRec = await fetch('/api/recueils', { signal: ctrlRec.signal, cache: 'no-cache' }).catch(() => null);
        }
        if (resRec && resRec.ok) {
          const dataRec: Recueil[] = await resRec.json();
          if (Array.isArray(dataRec) && dataRec.length > 0) {
            setRecueils(dataRec);
          }
        }
      } finally {
        clearTimeout(tRec);
      }

      // 2. Cantiques
      const ctrlSongs = new AbortController();
      const tSongs = setTimeout(() => ctrlSongs.abort(), 4000);
      try {
        let resSongs = await fetch(`${baseUrl}/api/songs`, { signal: ctrlSongs.signal, cache: 'no-cache' }).catch(() => null);
        if (!resSongs || !resSongs.ok) {
          resSongs = await fetch('/api/songs', { signal: ctrlSongs.signal, cache: 'no-cache' }).catch(() => null);
        }

        if (resSongs && resSongs.ok) {
          const rawSongs = await resSongs.json();
          if (Array.isArray(rawSongs) && rawSongs.length > 0) {
            const normalized = normalizeSongs(rawSongs);
            setSongs(normalized);
            setSelectedSong(prev => prev || normalized[0]);
          }
        }
      } finally {
        clearTimeout(tSongs);
      }
    } catch (err) {
      console.warn("Info synchronisation REST:", err);
    } finally {
      setLoadingSongs(false);
    }
  };

  // Synchronisation manuelle déclenchée par l'utilisateur
  const handleManualSync = () => {
    if (socketRef.current && socketRef.current.connected) {
      setLoadingSongs(true);
      socketRef.current.emit('demander-chants', (dataSongs: any[]) => {
        if (Array.isArray(dataSongs)) {
          const normalized = normalizeSongs(dataSongs);
          setSongs(normalized);
          setSelectedSong(prev => prev || normalized[0]);
        }
        setLoadingSongs(false);
        setLastSyncTime(new Date().toLocaleTimeString());
      });
      socketRef.current.emit('demander-recueils', (dataRecs: Recueil[]) => {
        if (Array.isArray(dataRecs)) {
          setRecueils(dataRecs);
        }
      });
      const serverUrl = getServerHttpUrl(serverIp, serverPort);
      fetchDataFromPC(serverUrl);
    } else {
      connectSocket(serverIp, serverPort);
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

  // Sauvegarder le programme local
  useEffect(() => {
    try {
      localStorage.setItem('maandiko_remote_program', JSON.stringify(programSongs));
    } catch {
      // ignore
    }
  }, [programSongs]);

  // Projeter une strophe / refrain vers la régie PC
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

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('projeter-paragraphe', payload);
    }
  };

  // Masquer l'écran (Écran noir)
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

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('projeter-paragraphe', payload);
    }
  };

  // Navigation strophe suivante / précédente
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

  // Gestion du programme de culte
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

  // Filtrage des cantiques
  const filteredSongs = useMemo(() => {
    const source = activeTab === 'program' ? programSongs : songs;
    let list = source;

    if (selectedRecueilId !== 'all' && activeTab !== 'program') {
      list = list.filter(s => {
        if (selectedRecueilId === 'ce') {
          return s.recueil_id === 'ce' || (s.category && s.category.includes('Épouse'));
        }
        if (selectedRecueilId === 'saf') {
          return s.recueil_id === 'saf' || (s.category && s.category.includes('Ailes'));
        }
        if (selectedRecueilId === 'cv') {
          return s.recueil_id === 'cv' || (s.category && s.category.includes('Victoire'));
        }
        return s.recueil_id === selectedRecueilId;
      });
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter(s => 
      s.number.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      (s.author && s.author.toLowerCase().includes(q)) ||
      (s.sections && s.sections.some(sec => sec.text.toLowerCase().includes(q)))
    );
  }, [songs, programSongs, selectedRecueilId, activeTab, searchQuery]);

  const isCurrentSectionLive = (section: SongSection) => {
    if (!projectedData || !projectedData.texte || projectedData.sermonId === 'BLACK' || projectedData.animPhase === 'EXITING' || projectedData.animPhase === 'OUT') {
      return false;
    }
    return projectedData.texte.trim() === section.text.trim() || projectedData.numero === section.label;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      
      {/* 1. TOP HEADER */}
      <header className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 shadow-lg flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-amber-500/15 rounded-xl border border-amber-500/30 text-amber-400">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wide text-slate-100 uppercase">Télécommande Régie</h1>
            <p className="text-[10px] font-medium text-amber-400/90 flex items-center gap-1">
              <span>{connected ? `Régie synchronisée (${songs.length} chants)` : 'Déconnecté du PC'}</span>
              {lastSyncTime && <span className="text-slate-400 hidden sm:inline">• {lastSyncTime}</span>}
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
          <span>{connected ? 'Régie PC OK' : 'Connexion IP'}</span>
        </button>
      </header>

      {/* 2. CONNECTION CONFIG DRAWER */}
      {showConnectionConfig && (
        <div className="bg-slate-900 border-b border-amber-500/40 p-4 shadow-2xl z-50 animate-in slide-in-from-top-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5" /> Adresse IP de la Régie PC
            </h2>
            <button 
              onClick={() => setShowConnectionConfig(false)}
              className="p-1 hover:bg-slate-800 rounded-md text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mb-2">
            Entrez l'adresse IP affichée dans la fenêtre <strong>Partager / Réseau</strong> sur le logiciel MaAndiko de votre ordinateur.
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
              <span>{isConnecting ? 'Connexion...' : 'Synchroniser'}</span>
            </button>
          </div>

          {connected && (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/30">
              <Check className="w-4 h-4 flex-shrink-0" /> Connecté avec succès à la régie ! {songs.length} cantiques synchronisés en temps réel.
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
            <span className={`w-2 h-2 rounded-full ${projectedData?.texte && projectedData?.sermonId !== 'BLACK' && projectedData?.animPhase !== 'EXITING' ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {projectedData?.texte && projectedData?.sermonId !== 'BLACK' && projectedData?.animPhase !== 'EXITING' ? 'En Direct sur Écran' : 'Écran Noir / Inactif'}
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

      {/* 4. SONG SELECTION BAR & MODAL TRIGGER */}
      <div className="bg-slate-900/80 border-b border-slate-800 px-3.5 py-2 flex items-center justify-between gap-2 flex-shrink-0">
        <button
          onClick={() => setShowSongPickerModal(true)}
          className="flex-1 flex items-center justify-between bg-slate-800/90 hover:bg-slate-750 active:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl text-xs transition group shadow-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search className="w-4 h-4 text-amber-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
            {selectedSong ? (
              <span className="truncate text-slate-200 font-bold">
                <span className="text-amber-400 font-mono">N° {selectedSong.number}</span> - {selectedSong.title}
              </span>
            ) : (
              <span className="text-slate-400 font-medium">Rechercher parmi les cantiques de la régie...</span>
            )}
          </div>
          <span className="text-[10px] uppercase font-black tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30 flex-shrink-0 ml-2">
            Changer
          </span>
        </button>

        {/* Worship program setlist counter / toggle */}
        <button
          onClick={() => {
            setActiveTab(activeTab === 'program' ? 'all' : 'program');
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border flex-shrink-0 shadow-sm ${
            activeTab === 'program'
              ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
          }`}
          title="Afficher le programme du culte"
        >
          <ListPlus className="w-3.5 h-3.5" />
          <span>Prog ({programSongs.length})</span>
        </button>
      </div>

      {/* 5. HORIZONTAL QUICK SONG SELECTOR STRIP */}
      {filteredSongs.length > 0 && (
        <div className="bg-slate-950 border-b border-slate-800/80 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-shrink-0">
          {filteredSongs.slice(0, 20).map(song => {
            const isSelected = selectedSong?.id === song.id;
            const inProg = programSongs.some(p => p.id === song.id);
            return (
              <button
                key={song.id}
                onClick={() => setSelectedSong(song)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold transition border flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md ring-1 ring-amber-400 font-black'
                    : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-800'
                }`}
              >
                <span>N° {song.number}</span>
                <span className="font-normal truncate max-w-[100px]">{song.title}</span>
                {inProg && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
              </button>
            );
          })}
          {filteredSongs.length > 20 && (
            <button
              onClick={() => setShowSongPickerModal(true)}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20"
            >
              + {filteredSongs.length - 20} autres...
            </button>
          )}
        </div>
      )}

      {/* 6. MAIN BODY: SELECTED SONG STANZAS / CHORUSES CARDS */}
      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {loadingSongs ? (
          <div className="flex flex-col items-center justify-center h-56 text-center text-slate-400 text-xs space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="font-bold text-slate-200">Synchronisation des cantiques avec la régie PC...</p>
            <p className="text-[11px] text-slate-500">Veuillez patienter pendant la réception des paroles.</p>
          </div>
        ) : !connected && songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-slate-400 text-xs space-y-3 px-4">
            <WifiOff className="w-12 h-12 text-rose-500/70" />
            <p className="text-sm font-bold text-slate-200">Non connecté à la Régie PC</p>
            <p className="text-[11px] text-slate-400 max-w-xs">
              Pour recueillir les cantiques de votre régie, renseignez l'adresse IP du PC et touchez Se connecter.
            </p>
            <button
              onClick={() => setShowConnectionConfig(true)}
              className="mt-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-lg flex items-center gap-2 transition"
            >
              <Sliders className="w-4 h-4" />
              <span>Configurer l'IP de la Régie</span>
            </button>
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
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                  {selectedSong.category && <span>{selectedSong.category}</span>}
                  {selectedSong.keySignature && <span className="px-1.5 py-0.2 bg-slate-800 rounded border border-slate-700 font-mono text-amber-400 font-bold">{selectedSong.keySignature}</span>}
                  {selectedSong.author && <span className="truncate">• {selectedSong.author}</span>}
                </div>
              </div>

              {/* Add / Remove from Program Button */}
              <button
                onClick={() => toggleProgram(selectedSong)}
                className={`p-2 rounded-xl text-xs font-bold border transition flex items-center gap-1 flex-shrink-0 ${
                  programSongs.some(p => p.id === selectedSong.id)
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                }`}
                title="Ajouter / Retirer du programme du culte"
              >
                <ListPlus className="w-4 h-4" />
                <span className="text-[11px]">
                  {programSongs.some(p => p.id === selectedSong.id) ? 'Au Programme' : '+ Prog'}
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
                      className={`relative p-3.5 rounded-xl border transition-all duration-150 cursor-pointer shadow-sm overflow-hidden active:scale-[0.99] ${
                        live
                          ? 'bg-emerald-950/90 border-emerald-400 ring-2 ring-emerald-500/50 shadow-emerald-950/50'
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
                            <span>EN DIRECT</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-semibold">
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
                  Ce cantique n'a pas encore de strophes découpées sur la régie.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center text-slate-400 text-xs space-y-3 px-4">
            <Music className="w-12 h-12 text-slate-600 animate-pulse" />
            <p className="text-sm font-bold text-slate-200">Choisissez un cantique</p>
            <p className="text-[11px] text-slate-400 max-w-xs">
              Touchez le bouton ci-dessous pour rechercher par numéro ou par titre parmi les cantiques de la régie.
            </p>
            <button
              onClick={() => setShowSongPickerModal(true)}
              className="mt-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-lg flex items-center gap-2 transition"
            >
              <Search className="w-4 h-4" />
              <span>Ouvrir la liste des chants ({songs.length})</span>
            </button>
          </div>
        )}
      </main>

      {/* 7. FULLSCREEN SONG PICKER MODAL */}
      {showSongPickerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col animate-in fade-in duration-150">
          {/* Modal Header */}
          <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-black text-slate-100 uppercase tracking-wide">
                Cantiques de la Régie ({songs.length})
              </h2>
            </div>
            <button 
              onClick={() => setShowSongPickerModal(false)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Input & Recueil Chips */}
          <div className="p-3 bg-slate-900/70 border-b border-slate-800 space-y-2 flex-shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Numéro (ex: 45) ou titre (ex: Crois Seulement)..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Recueils Filter Badges */}
            {recueils.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setSelectedRecueilId('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition border ${
                    selectedRecueilId === 'all'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                  }`}
                >
                  Tous ({songs.length})
                </button>
                {recueils.map(r => {
                  const isSel = selectedRecueilId === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRecueilId(r.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition border ${
                        isSel
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {r.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Song List in Modal */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {filteredSongs.length > 0 ? (
              filteredSongs.map(s => {
                const isSelected = selectedSong?.id === s.id;
                const inProg = programSongs.some(p => p.id === s.id);

                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      setSelectedSong(s);
                      setShowSongPickerModal(false);
                    }}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition active:scale-[0.99] ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 text-amber-200 shadow-md ring-1 ring-amber-400/40'
                        : 'bg-slate-900/90 hover:bg-slate-850 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-11 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-mono font-black text-amber-400 flex-shrink-0">
                        {s.number}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold truncate text-slate-100">{s.title}</h3>
                        <p className="text-[10px] text-slate-400 truncate">
                          {s.category || 'Cantique'} • {s.sections?.length || 0} strophe{s.sections?.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {inProg && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                          Prog
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <Search className="w-8 h-8 mx-auto text-slate-700" />
                <p>Aucun cantique ne correspond à votre recherche.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. BOTTOM FOOTER BAR */}
      <footer className="bg-slate-900 border-t border-slate-800 px-3.5 py-2 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
        <span className="font-mono text-[11px]">
          {filteredSongs.length} chant{filteredSongs.length > 1 ? 's' : ''} {activeTab === 'program' ? 'au programme' : 'synchronisés'}
        </span>
        <button 
          onClick={handleManualSync}
          className="flex items-center gap-1 text-amber-400 font-bold hover:underline py-1 px-2 rounded-lg hover:bg-slate-800 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Re-synchroniser
        </button>
      </footer>

    </div>
  );
}
