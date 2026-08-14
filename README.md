# MaAndiko Remote

Application mobile autonome (Android / Web) pour la régie des cantiques et projection en direct.

## 🚀 Fonctionnalités
- Synchronisation en direct avec le PC Régie via Socket.IO
- Sélection et recherche de cantiques par numéro et titre
- Projection instantanée des couplets et refrains au toucher
- Mode sombre optimisé pour mobile et tablette

## 🛠️ Développement local
```bash
npm install
npm run dev
```

## 📱 Build APK Android
Le workflow GitHub Actions dans `.github/workflows/build-apk.yml` génère automatiquement l'APK dès chaque push sur `main`.
