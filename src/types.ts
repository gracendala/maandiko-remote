export interface Recueil {
  id: string;
  title: string;
  description?: string;
  songsCount?: number;
}

export interface SongSection {
  id: string;
  label: string; // e.g. "Couplet 1", "Refrain 1", "Couplet 2", "Pont"
  type: string;
  color?: string;
  cardIndex?: number;
  totalCards?: number;
  text: string;
  lines?: string[];
}

export interface Song {
  id: string;
  recueil_id?: string;
  number: string;
  title: string;
  category?: string;
  author?: string;
  keySignature?: string;
  sections: SongSection[];
}

export interface ProjectedData {
  sermonId: string;
  numero: number | string;
  texte: string;
  estExtrait?: boolean;
  blockIndex?: number | null;
  totalBlocks?: number | null;
  titre_francais?: string;
  type_structure?: string;
  module?: 'brochures' | 'lyrics' | 'bible';
  animPhase?: 'ENTERING' | 'EXITING' | 'IN' | 'SLIDE' | 'OUT';
  timestamp?: number;
}
