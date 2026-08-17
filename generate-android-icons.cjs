const fs = require('fs');
const path = require('path');

console.log('🖼️ [GÉNÉRATEUR D\'ICÔNES ET CONFIGURATION ANDROID MAANDIKO]');

// 1. Trouver les dossiers racine et remote-app
const projectRoot = __dirname;
const remoteAppDir = fs.existsSync(path.join(projectRoot, 'remote-app'))
  ? path.join(projectRoot, 'remote-app')
  : projectRoot;

const sourceIconPng = path.join(projectRoot, 'public', 'icon.png');
const fallbackIconPng = path.join(remoteAppDir, 'public', 'icon.png');
const actualIcon = fs.existsSync(sourceIconPng) ? sourceIconPng : fallbackIconPng;

if (!fs.existsSync(actualIcon)) {
  console.error('❌ Fichier icon.png introuvable !');
  process.exit(1);
}

console.log('✅ Utilisation du logo source:', actualIcon);

// Créer les dossiers d'assets Capacitor
const assetsDir = path.join(remoteAppDir, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}
fs.copyFileSync(actualIcon, path.join(assetsDir, 'icon.png'));
fs.copyFileSync(actualIcon, path.join(assetsDir, 'icon-only.png'));
fs.copyFileSync(actualIcon, path.join(assetsDir, 'icon-foreground.png'));
fs.copyFileSync(actualIcon, path.join(assetsDir, 'splash.png'));

// Trouver le dossier res d'Android
const possibleResDirs = [
  path.join(remoteAppDir, 'android', 'app', 'src', 'main', 'res'),
  path.join(projectRoot, 'android', 'app', 'src', 'main', 'res')
];

let targetResDir = null;
for (const dir of possibleResDirs) {
  if (fs.existsSync(dir)) {
    targetResDir = dir;
    break;
  }
}

if (targetResDir) {
  console.log('📂 Dossier Android res trouvé:', targetResDir);

  // 1. Copier le logo dans les dossiers mipmap
  const mipmapFolders = [
    'mipmap-mdpi',
    'mipmap-hdpi',
    'mipmap-xhdpi',
    'mipmap-xxhdpi',
    'mipmap-xxxhdpi',
    'drawable',
    'drawable-v24',
    'drawable-hdpi',
    'drawable-mdpi',
    'drawable-xhdpi',
    'drawable-xxhdpi',
    'drawable-xxxhdpi'
  ];

  for (const folder of mipmapFolders) {
    const fullFolder = path.join(targetResDir, folder);
    if (!fs.existsSync(fullFolder)) {
      fs.mkdirSync(fullFolder, { recursive: true });
    }
    fs.copyFileSync(actualIcon, path.join(fullFolder, 'ic_launcher.png'));
    fs.copyFileSync(actualIcon, path.join(fullFolder, 'ic_launcher_round.png'));
    fs.copyFileSync(actualIcon, path.join(fullFolder, 'ic_launcher_foreground.png'));
  }

  // 2. SUPPRIMER le fichier vectoriel par défaut du robot Android vert dans drawable-v24 s'il existe
  const v24ForegroundXml = path.join(targetResDir, 'drawable-v24', 'ic_launcher_foreground.xml');
  if (fs.existsSync(v24ForegroundXml)) {
    fs.unlinkSync(v24ForegroundXml);
    console.log('🗑️ Supprimé le robot Android par défaut (drawable-v24/ic_launcher_foreground.xml)');
  }

  // 3. Adapter mipmap-anydpi-v26 pour utiliser le logo PNG ou une couleur sombre moderne
  const anydpiDir = path.join(targetResDir, 'mipmap-anydpi-v26');
  if (!fs.existsSync(anydpiDir)) {
    fs.mkdirSync(anydpiDir, { recursive: true });
  }

  const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveIconXml);
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveIconXml);

  // 4. Définir le fond de l'icône adaptative en bleu nuit sombre élégant (#0F172A)
  const valuesDir = path.join(targetResDir, 'values');
  if (!fs.existsSync(valuesDir)) {
    fs.mkdirSync(valuesDir, { recursive: true });
  }
  const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0F172A</color>
</resources>`;
  fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'), bgXml);

  console.log('✨ Logo officiel MaAndiko Studio et icônes adaptatives injectés avec succès dans tout le projet Android !');
} else {
  console.log('⚠️ Aucun dossier android/app/src/main/res trouvé pour le moment.');
}
