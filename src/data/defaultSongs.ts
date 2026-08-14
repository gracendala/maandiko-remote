import { Song } from '../types';

export const DEFAULT_SONGS: Song[] = [
  {
    id: 'crois-seulement-1',
    number: '001',
    title: 'Crois seulement',
    category: 'Cantiques de l\'Évangile',
    sections: [
      {
        id: 'sec-1-1',
        label: 'Couplet 1',
        type: 'Couplet',
        color: '#2563eb',
        text: 'Crois seulement, crois seulement,\nTout est possible, crois seulement;\nCrois seulement, crois seulement,\nTout est possible, crois seulement.'
      },
      {
        id: 'sec-1-ref',
        label: 'Refrain',
        type: 'Refrain',
        color: '#e11d48',
        text: 'Jésus est ici, Jésus est ici,\nTout est possible, Jésus est ici;\nJésus est ici, Jésus est ici,\nTout est possible, Jésus est ici.'
      },
      {
        id: 'sec-1-2',
        label: 'Couplet 2',
        type: 'Couplet',
        color: '#2563eb',
        text: 'Seigneur, je crois, Seigneur, je crois,\nTout est possible, Seigneur, je crois;\nSeigneur, je crois, Seigneur, je crois,\nTout est possible, Seigneur, je crois.'
      }
    ]
  },
  {
    id: 'grace-infinie-2',
    number: '002',
    title: 'Grâce infinie',
    category: 'Cantiques de l\'Évangile',
    sections: [
      {
        id: 'sec-2-1',
        label: 'Couplet 1',
        type: 'Couplet',
        color: '#2563eb',
        text: 'Grâce infinie du tout-puissant\nQui sauva un misérable comme moi !\nJ\'étais perdu mais je suis retrouvé,\nJ\'étais aveugle, maintenant je vois.'
      },
      {
        id: 'sec-2-2',
        label: 'Couplet 2',
        type: 'Couplet',
        color: '#2563eb',
        text: 'C\'est la grâce qui m\'enseigna la crainte,\nEt la grâce qui ôta mes peurs;\nCombien précieuse parut cette grâce\nÀ l\'heure où j\'ai cru !'
      }
    ]
  },
  {
    id: 'rocher-des-siecles-3',
    number: '003',
    title: 'Rocher des siècles',
    category: 'Cantiques de l\'Évangile',
    sections: [
      {
        id: 'sec-3-1',
        label: 'Couplet 1',
        type: 'Couplet',
        color: '#2563eb',
        text: 'Rocher des siècles fendu pour moi,\nLaisse-moi me cacher en Toi;\nQue l\'eau et le sang\nQui coulèrent de Ton côté percé\nSoient pour le péché le double remède.'
      }
    ]
  }
];
