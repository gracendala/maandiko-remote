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
  ListOrdered,
  PlusCircle,
  X, 
  Layers, 
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { Song, SongSection, ProgramItem, ProjectedData } from './types';

export default function App() {
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
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Programme du Culte (Synchronisé avec la Régie PC - Vide par défaut tant que le PC n'a rien envoyé)
  const [programItems, setProgramItems] = useState<ProgramItem[]>(() => {
    try {
      const saved = localStorage.getItem('protext_remote_worship_program');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Chant sélectionné pour affichage des strophes
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [selectedProgramIndex, setSelectedProgramIndex] = useState<number | null>(null);

  // État de projection en direct
  const [projectedData, setProjectedData] = useState<ProjectedData | null>(null);

  // Modal d'ajout express d'un chant
  const [showAddSongModal, setShowAddSongModal] = useState<boolean>(false);
  const [allSongsCache, setAllSongsCache] = useState<Song[]>([]);
  const [searchSongQuery, setSearchSongQuery] = useState<string>('');

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

  // Sauvegarder localement le programme
  useEffect(() => {
    try {
      localStorage.setItem('protext_remote_worship_program', JSON.stringify(programItems));
    } catch (e) {
      console.error(e);
    }
  }, [programItems]);

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
      setLastSyncTime(new Date().toLocaleTimeString());

      // Demander immédiatement le programme du culte et les chants
      newSocket.emit('demander-programme-culte');
      newSocket.emit('demander-chants');
    });

    newSocket.on('disconnect', () => {
      console.warn('❌ Déconnecté de la régie.');
      setConnected(false);
      setStatusMessage('Déconnecté de la régie');
    });

    newSocket.on('connect_error', (err) => {
      console.warn('⚠️ Erreur de connexion:', err.message);
      setConnected(false);
      setStatusMessage(`Erreur: Vérifiez l'IP ${targetIp}`);
    });

    // Réception du programme du culte en temps réel
    newSocket.on('programme-culte-maj', (data: any[]) => {
      console.log('📋 Programme du culte reçu:', data?.length || 0, 'éléments');
      if (Array.isArray(data) && data.length > 0) {
        const formatted = data.map(item => {
          if (item.type === 'song' && item.song) {
            return { ...item, song: normalizeSong(item.song) };
          }
          return item;
        });
        setProgramItems(formatted);
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    });

    // Réception de la liste globale des chants (pour recherche rapide)
    newSocket.on('liste-chants', (rawSongs: any[]) => {
      if (Array.isArray(rawSongs) && rawSongs.length > 0) {
        const normalized = rawSongs.map(normalizeSong);
        setAllSongsCache(normalized);
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
      socketRef.current.emit('demander-programme-culte');
      socketRef.current.emit('demander-chants');
    }

    // Essayer également via HTTP en secours
    const url = getFullServerUrl(serverIp, serverPort);
    try {
      const res = await fetch(`${url}/api/programme-culte`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const formatted = data.map(item => {
            if (item.type === 'song' && item.song) {
              return { ...item, song: normalizeSong(item.song) };
            }
            return item;
          });
          setProgramItems(formatted);
          setLastSyncTime(new Date().toLocaleTimeString());
          setStatusMessage('Programme synchronisé');
        }
      }
    } catch (e) {
      console.warn("Échec requête HTTP secours:", e);
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
    
    // Trouver l'index de la strophe actuellement projetée
    const currentText = projectedData?.texte || '';
    const currentIndex = selectedSong.sections.findIndex(s => s.text === currentText);
    
    if (currentIndex === -1) {
      // Projeter la première strophe
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

  // Ouvrir un chant du programme
  const handleOpenSongFromProgram = (item: ProgramItem, index: number) => {
    if (item.song) {
      setSelectedSong(item.song);
      setSelectedProgramIndex(index);
    }
  };

  // Ajouter un chant au programme depuis la recherche express
  const handleAddSongToProgram = (song: Song) => {
    const newItem: ProgramItem = {
      id: `prog-${Date.now()}`,
      songId: song.id,
      type: 'song',
      title: song.title,
      number: song.number,
      category: song.category,
      song: song
    };

    const newProg = [...programItems, newItem];
    setProgramItems(newProg);

    // Mettre à jour la régie PC
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('mettre-a-jour-programme-culte', newProg);
    }

    setShowAddSongModal(false);
    setSelectedSong(song);
    setSelectedProgramIndex(newProg.length - 1);
  };

  // Chants filtrés pour la recherche express
  const filteredSongs = useMemo(() => {
    if (!searchSongQuery.trim()) return allSongsCache.slice(0, 20);
    const q = searchSongQuery.toLowerCase().trim();
    return allSongsCache.filter(s => 
      s.number.includes(q) || 
      s.title.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [allSongsCache, searchSongQuery]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      
      {/* ==================== BARRE SUPÉRIEURE (HEADER) ==================== */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base text-white tracking-tight flex items-center gap-2">
              Télécommande Culte
              {connected ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Wifi className="w-3 h-3 mr-1 inline" /> En ligne
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <WifiOff className="w-3 h-3 mr-1 inline" /> Hors ligne
                </span>
              )}
            </h1>
            <p className="text-[11px] text-slate-400">
              {connected ? `Régie: ${serverIp}:${serverPort}` : 'Non connecté au PC'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className={`p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 transition-all border border-slate-700 ${isSyncing ? 'animate-spin text-amber-400' : ''}`}
            title="Actualiser le programme"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowConfigModal(true)}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 transition-all border border-slate-700"
            title="Paramètres de connexion"
          >
            <Sliders className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ==================== BANDEAU LIVE (MONITEUR TEMPS RÉEL) ==================== */}
      <div className={`shrink-0 px-4 py-2.5 border-b transition-colors duration-200 flex items-center justify-between gap-3 ${
        projectedData ? 'bg-amber-950/40 border-amber-500/30' : 'bg-slate-900/60 border-slate-800'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {projectedData ? (
            <>
              <span className="flex h-3 w-3 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                  En Direct : {projectedData.titre_francais || projectedData.sermonId} • {projectedData.numero}
                </p>
                <p className="text-xs text-slate-200 truncate font-medium">
                  {projectedData.texte.replace(/\n/g, ' ')}
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <EyeOff className="w-4 h-4 text-slate-500" />
              <span>Aucune projection en cours (Écran noir)</span>
            </div>
          )}
        </div>

        {projectedData && (
          <button
            onClick={handleBlackScreen}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Couper</span>
          </button>
        )}
      </div>

      {/* ==================== CORPS PRINCIPAL ==================== */}
      <main className="flex-1 overflow-hidden flex flex-col relative">

        {/* ---------------- VUE 1 : PROGRAMME DU CULTE ---------------- */}
        {!selectedSong ? (
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            
            {/* Titre de section + Bouton d'ajout */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ListOrdered className="w-5 h-5 text-amber-400" />
                  Programme du Culte
                </h2>
                <p className="text-xs text-slate-400">
                  {programItems.filter(i => i.type === 'song').length} chant(s) synchronisé(s) avec la régie
                </p>
              </div>

              <button
                onClick={() => setShowAddSongModal(true)}
                className="px-3 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95 transition-transform"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Ajouter</span>
              </button>
            </div>

            {/* Liste des chants du programme */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 pb-4">
              {programItems.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
                  <Music className="w-12 h-12 text-slate-600 mb-3 animate-pulse" />
                  <p className="text-sm font-semibold text-slate-300">Aucun chant dans le programme</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Préparez le programme sur le PC de régie ou touchez « Ajouter » pour sélectionner un cantique.
                  </p>
                  <button
                    onClick={handleManualSync}
                    className="mt-4 px-4 py-2 rounded-xl bg-slate-800 text-amber-400 border border-slate-700 text-xs font-semibold flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Actualiser depuis le PC
                  </button>
                </div>
              ) : (
                programItems.map((item, idx) => {
                  if (item.type === 'note') {
                    return (
                      <div key={item.id || idx} className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl">
                        <p className="text-xs font-bold text-amber-400">📌 {item.title}</p>
                        {item.note && <p className="text-xs text-slate-400 mt-0.5">{item.note}</p>}
                      </div>
                    );
                  }

                  const isCurrentlyProjected = projectedData?.titre_francais?.includes(item.title);

                  return (
                    <div
                      key={item.id || idx}
                      onClick={() => handleOpenSongFromProgram(item, idx)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.98] ${
                        isCurrentlyProjected
                          ? 'bg-amber-950/40 border-amber-500/50 shadow-lg shadow-amber-500/10'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
                          isCurrentlyProjected 
                            ? 'bg-amber-500 text-slate-950' 
                            : 'bg-slate-800 text-amber-400 border border-slate-700'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-amber-400 border border-slate-700">
                              N° {item.number}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate">
                              {item.category || "Cantiques de l'Épouse"}
                            </span>
                          </div>
                          <h3 className="font-bold text-sm text-white truncate mt-0.5">
                            {item.title}
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {item.song?.sections?.length || 0} strophe(s) / refrain(s)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isCurrentlyProjected && (
                          <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
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
        ) : (

          /* ---------------- VUE 2 : DÉTAIL DES PAROLES D'UN CHANT ---------------- */
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Header du Chant */}
            <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <button
                onClick={() => setSelectedSong(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Programme</span>
              </button>

              <div className="text-center min-w-0 flex-1">
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                  N° {selectedSong.number}
                </span>
                <h2 className="font-bold text-sm text-white truncate mt-0.5">
                  {selectedSong.title}
                </h2>
              </div>

              <button
                onClick={handleBlackScreen}
                className="p-2 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white active:scale-95"
                title="Écran Noir"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            </div>

            {/* Barre de navigation rapide Strophe Précédente / Suivante */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-900/60 border-b border-slate-800 shrink-0">
              <button
                onClick={handlePrevSection}
                className="py-2.5 px-3 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Strophe Précédente</span>
              </button>
              <button
                onClick={handleNextSection}
                className="py-2.5 px-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-amber-500/20 transition-transform"
              >
                <span>Strophe Suivante</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Liste des Strophes & Refrains */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-8">
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
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          isCurrent
                            ? 'bg-emerald-500 text-slate-950'
                            : isRefrain
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}>
                          {section.label}
                        </span>

                        {isCurrent && (
                          <span className="flex items-center gap-1.5 text-xs font-black text-emerald-400 animate-pulse">
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
        )}
      </main>

      {/* ==================== MODAL RECHERCHE EXPRESS / AJOUT CHANT ==================== */}
      {showAddSongModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl flex-1 flex flex-col overflow-hidden max-w-lg w-full mx-auto shadow-2xl">
            
            {/* Header Modal */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Search className="w-5 h-5 text-amber-400" />
                Ajouter un Cantique
              </h3>
              <button
                onClick={() => setShowAddSongModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Champ de recherche */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchSongQuery}
                  onChange={(e) => setSearchSongQuery(e.target.value)}
                  placeholder="Tapez le numéro (ex: 45) ou un titre..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Résultats de recherche */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredSongs.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <p className="text-sm">Aucun cantique trouvé.</p>
                </div>
              ) : (
                filteredSongs.map((song) => (
                  <div
                    key={song.id}
                    onClick={() => handleAddSongToProgram(song)}
                    className="p-3 bg-slate-850 hover:bg-slate-800 border border-slate-700/60 rounded-xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                        {song.number}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-white truncate">{song.title}</p>
                        <p className="text-[11px] text-slate-400">{song.category || "Cantiques de l'Épouse"}</p>
                      </div>
                    </div>
                    <PlusCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

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
