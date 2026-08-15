import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Wifi, 
  WifiOff, 
  EyeOff, 
  Music, 
  RefreshCw, 
  Search, 
  ChevronRight, 
  ChevronLeft, 
  Sliders, 
  Radio, 
  ListOrdered,
  BookOpen,
  PlusCircle,
  X, 
  ArrowLeft,
  Check
} from 'lucide-react';
import { Song, SongSection, ProgramItem, ProjectedData, Recueil } from './types';

export default function App() {
  // Navigation principale : 'programme' ou 'cantiques'
  const [activeTab, setActiveTab] = useState<'programme' | 'cantiques'>('cantiques');

  // Configuration Réseau
  const [serverIp, setServerIp] = useState<string>(() => {
    return localStorage.getItem('protext_remote_server_ip') || (window.location.hostname || '192.168.1.35');
  });
  const [serverPort, setServerPort] = useState<string>(() => {
    return localStorage.getItem('protext_remote_server_port') || (window.location.port || '3000');
  });

  const [connected, setConnected] = useState<boolean>(false);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Base des cantiques et recueils reçus du PC
  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('protext_remote_cached_songs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [recueils, setRecueils] = useState<Recueil[]>(() => {
    try {
      const saved = localStorage.getItem('protext_remote_cached_recueils');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedRecueilId, setSelectedRecueilId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Programme du Culte (Synchronisé avec la Régie PC)
  const [programItems, setProgramItems] = useState<ProgramItem[]>(() => {
    try {
      const saved = localStorage.getItem('protext_remote_worship_program');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Chant sélectionné pour affichage et projection des strophes
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  // État de projection en direct sur les écrans du PC
  const [projectedData, setProjectedData] = useState<ProjectedData | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Formater URL du serveur
  const getFullServerUrl = (ip: string, port: string) => {
    let cleanIp = (ip || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    let cleanPort = (port || '3000').trim();
    if (!cleanIp) cleanIp = window.location.hostname || 'localhost';
    if (cleanPort === '80' || !cleanPort) return `http://${cleanIp}`;
    return `http://${cleanIp}:${cleanPort}`;
  };

  // Normaliser un chant
  const normalizeSong = (s: any): Song => {
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
      category: s.category || "Cantiques de l'Épouse",
      author: s.author || '',
      keySignature: s.keySignature || s.key_signature || '',
      sections: Array.isArray(sections) ? sections : []
    };
  };

  // Sauvegarder les données en cache local
  useEffect(() => {
    try {
      localStorage.setItem('protext_remote_worship_program', JSON.stringify(programItems));
    } catch (e) {
      console.error(e);
    }
  }, [programItems]);

  useEffect(() => {
    try {
      if (songs.length > 0) {
        localStorage.setItem('protext_remote_cached_songs', JSON.stringify(songs));
      }
    } catch (e) {
      console.error(e);
    }
  }, [songs]);

  useEffect(() => {
    try {
      if (recueils.length > 0) {
        localStorage.setItem('protext_remote_cached_recueils', JSON.stringify(recueils));
      }
    } catch (e) {
      console.error(e);
    }
  }, [recueils]);

  // Initialisation et gestion de la connexion Socket.IO
  const connectToServer = (targetIp: string, targetPort: string) => {
    const url = getFullServerUrl(targetIp, targetPort);
    console.log("🔌 Tentative de connexion au PC de régie sur:", url);
    setStatusMessage(`Connexion à ${url}...`);

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    const newSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('✅ Connecté au serveur ProText Régie!');
      setConnected(true);
      setStatusMessage('Connecté à la régie PC');
      localStorage.setItem('protext_remote_server_ip', targetIp);
      localStorage.setItem('protext_remote_server_port', targetPort);

      // Demander immédiatement toutes les données
      newSocket.emit('demander-chants');
      newSocket.emit('demander-recueils');
      newSocket.emit('demander-programme-culte');
    });

    newSocket.on('disconnect', () => {
      console.warn('❌ Déconnecté de la régie.');
      setConnected(false);
      setStatusMessage('Déconnecté de la régie');
    });

    newSocket.on('connect_error', (err) => {
      console.warn('⚠️ Erreur de connexion:', err.message);
      setConnected(false);
      setStatusMessage(`Erreur connexion: Vérifiez l'IP ${targetIp}`);
    });

    // Réception de la liste complète des chants
    newSocket.on('liste-chants', (rawSongs: any[]) => {
      console.log('🎵 Chants reçus du PC:', rawSongs?.length || 0);
      if (Array.isArray(rawSongs) && rawSongs.length > 0) {
        const normalized = rawSongs.map(normalizeSong);
        setSongs(normalized);
      }
    });

    // Réception des recueils
    newSocket.on('liste-recueils', (rawRecueils: any[]) => {
      console.log('📚 Recueils reçus du PC:', rawRecueils?.length || 0);
      if (Array.isArray(rawRecueils) && rawRecueils.length > 0) {
        setRecueils(rawRecueils);
      }
    });

    // Réception du programme du culte en temps réel
    newSocket.on('programme-culte-maj', (data: any[]) => {
      console.log('📋 Programme du culte reçu:', data?.length || 0, 'éléments');
      if (Array.isArray(data)) {
        const formatted = data.map(item => {
          if (item.type === 'song' && item.song) {
            return { ...item, song: normalizeSong(item.song) };
          }
          return item;
        });
        setProgramItems(formatted);
      }
    });

    // Synchronisation en direct de l'affichage vidéo-projeté
    newSocket.on('afficher-paragraphe', (projData: ProjectedData) => {
      setProjectedData(projData);
    });
  };

  // Connexion au montage
  useEffect(() => {
    connectToServer(serverIp, serverPort);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Fonction d'actualisation manuelle
  const handleManualSync = async () => {
    setIsSyncing(true);
    setStatusMessage('Actualisation en cours...');

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('demander-chants');
      socketRef.current.emit('demander-recueils');
      socketRef.current.emit('demander-programme-culte');
    }

    // Requêtes HTTP de secours
    const url = getFullServerUrl(serverIp, serverPort);
    try {
      const [resSongs, resRecs, resProg] = await Promise.allSettled([
        fetch(`${url}/api/songs`, { signal: AbortSignal.timeout(3500) }),
        fetch(`${url}/api/recueils`, { signal: AbortSignal.timeout(3500) }),
        fetch(`${url}/api/programme-culte`, { signal: AbortSignal.timeout(3500) })
      ]);

      if (resSongs.status === 'fulfilled' && resSongs.value.ok) {
        const sData = await resSongs.value.json();
        if (Array.isArray(sData) && sData.length > 0) setSongs(sData.map(normalizeSong));
      }
      if (resRecs.status === 'fulfilled' && resRecs.value.ok) {
        const rData = await resRecs.value.json();
        if (Array.isArray(rData) && rData.length > 0) setRecueils(rData);
      }
      if (resProg.status === 'fulfilled' && resProg.value.ok) {
        const pData = await resProg.value.json();
        if (Array.isArray(pData)) {
          setProgramItems(pData.map(item => item.song ? { ...item, song: normalizeSong(item.song) } : item));
        }
      }
      setStatusMessage('Données actualisées');
    } catch (e) {
      console.warn("Erreur actualisation HTTP:", e);
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  // Projeter une strophe / refrain
  const handleProjectSection = (song: Song, section: SongSection) => {
    if (!socketRef.current || !socketRef.current.connected) {
      alert("⚠️ Vous n'êtes pas connecté au PC de la régie. Vérifiez l'adresse IP dans les paramètres.");
      return;
    }

    const data: ProjectedData = {
      sermonId: song.title,
      numero: section.label,
      texte: section.text,
      titre_francais: `N° ${song.number} - ${song.title}`,
      type_structure: 'CANTIQUE',
      module: 'lyrics',
      timestamp: Date.now()
    };

    socketRef.current.emit('projeter-paragraphe', data);
    setProjectedData(data);
  };

  // Masquer l'écran (Écran Noir)
  const handleBlackScreen = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('projeter-paragraphe', null);
    }
    setProjectedData(null);
  };

  // Navigation vers la strophe suivante / précédente
  const handleNextSection = () => {
    if (!selectedSong || !selectedSong.sections || selectedSong.sections.length === 0) return;
    const currentText = projectedData?.texte || '';
    const currentIndex = selectedSong.sections.findIndex(s => s.text === currentText);
    
    if (currentIndex === -1) {
      handleProjectSection(selectedSong, selectedSong.sections[0]);
    } else if (currentIndex < selectedSong.sections.length - 1) {
      handleProjectSection(selectedSong, selectedSong.sections[currentIndex + 1]);
    }
  };

  const handlePrevSection = () => {
    if (!selectedSong || !selectedSong.sections || selectedSong.sections.length === 0) return;
    const currentText = projectedData?.texte || '';
    const currentIndex = selectedSong.sections.findIndex(s => s.text === currentText);
    
    if (currentIndex > 0) {
      handleProjectSection(selectedSong, selectedSong.sections[currentIndex - 1]);
    }
  };

  // Ajouter un chant au programme du culte
  const handleAddToProgram = (song: Song) => {
    const isAlreadyIn = programItems.some(i => i.songId === song.id || (i.number === song.number && i.title === song.title));
    if (isAlreadyIn) {
      alert(`« N° ${song.number} - ${song.title} » est déjà dans le programme.`);
      return;
    }

    const newItem: ProgramItem = {
      id: `prog-${Date.now()}`,
      songId: song.id,
      type: 'song',
      title: song.title,
      number: song.number,
      category: song.category,
      song: song
    };

    const updated = [...programItems, newItem];
    setProgramItems(updated);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('mettre-a-jour-programme-culte', updated);
    }
  };

  // Filtrage des cantiques
  const filteredSongs = useMemo(() => {
    return songs.filter(s => {
      if (selectedRecueilId !== 'all' && s.recueil_id !== selectedRecueilId) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        s.number.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        (s.author && s.author.toLowerCase().includes(q)) ||
        s.sections?.some(sec => sec.text.toLowerCase().includes(q))
      );
    });
  }, [songs, selectedRecueilId, searchQuery]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      
      {/* ==================== BARRE SUPÉRIEURE (HEADER) ==================== */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Music className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm sm:text-base text-white tracking-tight flex items-center gap-2 truncate">
              Télécommande Cantiques
              {connected ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <Wifi className="w-3 h-3 mr-1 inline" /> En ligne
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  <WifiOff className="w-3 h-3 mr-1 inline" /> Hors ligne
                </span>
              )}
            </h1>
            <p className="text-[11px] text-slate-400 truncate">
              {connected ? `${serverIp}:${serverPort}` : 'Vérifiez la connexion au PC'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className={`p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 transition-all border border-slate-700 ${isSyncing ? 'animate-spin text-amber-400' : ''}`}
            title="Actualiser depuis le PC"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowConfigModal(true)}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 transition-all border border-slate-700"
            title="Paramètres IP"
          >
            <Sliders className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ==================== BANDEAU LIVE (MONITEUR TEMPS RÉEL) ==================== */}
      <div className={`shrink-0 px-4 py-2 border-b transition-colors duration-200 flex items-center justify-between gap-3 ${
        projectedData ? 'bg-amber-950/40 border-amber-500/30' : 'bg-slate-900/60 border-slate-800'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {projectedData ? (
            <>
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 truncate">
                  PROJETÉ : {projectedData.titre_francais || projectedData.sermonId} • {projectedData.numero}
                </p>
                <p className="text-xs text-slate-200 truncate font-medium">
                  {projectedData.texte.replace(/\n/g, ' ')}
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs truncate">
              <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="truncate">Écran en attente (Rien n'est projeté)</span>
            </div>
          )}
        </div>

        {projectedData && (
          <button
            onClick={handleBlackScreen}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white border border-rose-500/30 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Couper</span>
          </button>
        )}
      </div>

      {/* ==================== CORPS PRINCIPAL ==================== */}
      <main className="flex-1 overflow-hidden flex flex-col relative">

        {/* SI UN CHANT EST SÉLECTIONNÉ : AFFICHER SES STROPHES */}
        {selectedSong ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Header du Chant */}
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <button
                onClick={() => setSelectedSong(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 active:scale-95 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Retour</span>
              </button>

              <div className="text-center min-w-0 flex-1 px-2">
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                  N° {selectedSong.number}
                </span>
                <h2 className="font-bold text-sm text-white truncate mt-0.5">
                  {selectedSong.title}
                </h2>
              </div>

              <button
                onClick={() => handleAddToProgram(selectedSong)}
                className="p-2 rounded-xl bg-slate-800 text-amber-400 border border-slate-700 hover:bg-slate-700 active:scale-95 shrink-0"
                title="Ajouter au programme du culte"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            </div>

            {/* Barre de navigation rapide Strophe Précédente / Suivante */}
            <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-900/60 border-b border-slate-800 shrink-0">
              <button
                onClick={handlePrevSection}
                className="py-2.5 px-3 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Précédente</span>
              </button>
              <button
                onClick={handleNextSection}
                className="py-2.5 px-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-amber-500/20 transition-transform"
              >
                <span>Suivante</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Liste des Strophes & Refrains */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 pb-8">
              {selectedSong.sections && selectedSong.sections.length > 0 ? (
                selectedSong.sections.map((section, sIdx) => {
                  const isCurrent = projectedData?.texte === section.text;
                  const isRefrain = section.label.toLowerCase().includes('refrain') || section.type === 'refrain';

                  return (
                    <div
                      key={section.id || sIdx}
                      onClick={() => handleProjectSection(selectedSong, section)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden active:scale-[0.98] ${
                        isCurrent
                          ? 'bg-amber-950/60 border-emerald-500 ring-2 ring-emerald-500 shadow-xl'
                          : isRefrain
                          ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* En-tête de strophe */}
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                          isCurrent
                            ? 'bg-emerald-500 text-slate-950'
                            : isRefrain
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}>
                          {section.label}
                        </span>

                        {isCurrent && (
                          <span className="flex items-center gap-1.5 text-[11px] font-black text-emerald-400 animate-pulse">
                            <Radio className="w-3.5 h-3.5" />
                            EN DIRECT
                          </span>
                        )}
                      </div>

                      {/* Paroles */}
                      <p className="text-sm sm:text-base font-medium text-slate-100 whitespace-pre-line leading-relaxed">
                        {section.text}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-500">
                  <p className="text-sm">Aucune strophe enregistrée pour ce chant.</p>
                </div>
              )}
            </div>
          </div>
        ) : (

          /* LISTE PRINCIPALE AVEC ONGLETS (PROGRAMME vs CATALOGUE) */
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Onglets de navigation */}
            <div className="flex border-b border-slate-800 bg-slate-900/90 shrink-0 px-3 pt-2 gap-2">
              <button
                onClick={() => setActiveTab('cantiques')}
                className={`flex-1 py-2.5 px-3 rounded-t-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border-t border-x ${
                  activeTab === 'cantiques'
                    ? 'bg-slate-950 text-amber-400 border-slate-800 border-b-slate-950'
                    : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Tous les Cantiques ({songs.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('programme')}
                className={`flex-1 py-2.5 px-3 rounded-t-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border-t border-x ${
                  activeTab === 'programme'
                    ? 'bg-slate-950 text-amber-400 border-slate-800 border-b-slate-950'
                    : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                <ListOrdered className="w-4 h-4" />
                <span>Programme Culte ({programItems.filter(i => i.type === 'song').length})</span>
              </button>
            </div>

            {/* CONTENU ONGLET 1 : TOUS LES CANTIQUES */}
            {activeTab === 'cantiques' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3">
                
                {/* Barre de recherche par numéro ou titre */}
                <div className="relative mb-2.5">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher numéro (ex: 45) ou titre..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filtre par Recueil si disponible */}
                {recueils.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-1 scrollbar-none">
                    <button
                      onClick={() => setSelectedRecueilId('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                        selectedRecueilId === 'all'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      Tous ({songs.length})
                    </button>
                    {recueils.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRecueilId(r.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                          selectedRecueilId === r.id
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {r.title}
                      </button>
                    ))}
                  </div>
                )}

                {/* Liste des cantiques */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 pb-4">
                  {filteredSongs.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 rounded-2xl border border-slate-800">
                      <Music className="w-10 h-10 text-slate-600 mb-2" />
                      <p className="text-sm font-semibold text-slate-300">
                        {songs.length === 0 ? "Chargement des cantiques..." : "Aucun cantique trouvé"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">
                        {songs.length === 0 
                          ? "Vérifiez que le logiciel PC de régie est bien lancé sur le même réseau Wi-Fi." 
                          : "Essayez un autre mot-clé ou numéro."}
                      </p>
                      <button
                        onClick={handleManualSync}
                        className="mt-4 px-4 py-2 rounded-xl bg-slate-800 text-amber-400 border border-slate-700 text-xs font-semibold flex items-center gap-2 active:scale-95"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Recharger depuis le PC
                      </button>
                    </div>
                  ) : (
                    filteredSongs.map((song) => {
                      const isCurrentlyProjected = projectedData?.titre_francais?.includes(song.title);

                      return (
                        <div
                          key={song.id}
                          onClick={() => setSelectedSong(song)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.98] ${
                            isCurrentlyProjected
                              ? 'bg-amber-950/40 border-amber-500/50 shadow-lg shadow-amber-500/10'
                              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                              {song.number}
                            </span>
                            <div className="min-w-0">
                              <h3 className="font-bold text-sm text-white truncate">
                                {song.title}
                              </h3>
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {song.category || "Cantiques"} • {song.sections?.length || 0} strophe(s)
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isCurrentlyProjected && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                                LIVE
                              </span>
                            )}
                            <ChevronRight className="w-5 h-5 text-slate-500" />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* CONTENU ONGLET 2 : PROGRAMME DU CULTE */}
            {activeTab === 'programme' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3">
                <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 pb-4">
                  {programItems.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 rounded-2xl border border-slate-800">
                      <ListOrdered className="w-10 h-10 text-slate-600 mb-2" />
                      <p className="text-sm font-semibold text-slate-300">Programme du culte vide</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">
                        Allez dans l'onglet « Tous les Cantiques », choisissez un chant et touchez le bouton « + » pour le rajouter ici.
                      </p>
                      <button
                        onClick={() => setActiveTab('cantiques')}
                        className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold shadow-md active:scale-95"
                      >
                        Parcourir les cantiques
                      </button>
                    </div>
                  ) : (
                    programItems.map((item, idx) => {
                      if (item.type === 'note') {
                        return (
                          <div key={item.id || idx} className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
                            <p className="text-xs font-bold text-amber-400">📌 {item.title}</p>
                            {item.note && <p className="text-xs text-slate-400 mt-0.5">{item.note}</p>}
                          </div>
                        );
                      }

                      const isCurrentlyProjected = projectedData?.titre_francais?.includes(item.title);

                      return (
                        <div
                          key={item.id || idx}
                          onClick={() => {
                            if (item.song) {
                              setSelectedSong(item.song);
                            } else {
                              const found = songs.find(s => s.id === item.songId || (s.number === item.number && s.title === item.title));
                              if (found) setSelectedSong(found);
                            }
                          }}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.98] ${
                            isCurrentlyProjected
                              ? 'bg-amber-950/40 border-amber-500/50 shadow-lg shadow-amber-500/10'
                              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-lg bg-slate-800 text-amber-400 font-bold text-xs flex items-center justify-center border border-slate-700 shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-bold text-amber-400">
                                  N° {item.number}
                                </span>
                                <span className="text-[10px] text-slate-400 truncate">
                                  {item.category || "Cantiques"}
                                </span>
                              </div>
                              <h3 className="font-bold text-sm text-white truncate mt-0.5">
                                {item.title}
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isCurrentlyProjected && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                                LIVE
                              </span>
                            )}
                            <ChevronRight className="w-5 h-5 text-slate-500" />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ==================== MODAL CONFIGURATION IP PC ==================== */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                Connexion Régie PC
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Adresse IP du PC de régie
                </label>
                <input
                  type="text"
                  value={serverIp}
                  onChange={(e) => setServerIp(e.target.value)}
                  placeholder="Ex: 192.168.1.35"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Visible sur le PC dans Menu &gt; Télécommande Mobile
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Port du serveur
                </label>
                <input
                  type="text"
                  value={serverPort}
                  onChange={(e) => setServerPort(e.target.value)}
                  placeholder="3000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => setShowConfigModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  connectToServer(serverIp, serverPort);
                  setShowConfigModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 shadow-md shadow-amber-500/20"
              >
                Connecter
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
