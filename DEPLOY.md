# Guide de déploiement — ErgoTrack PRO

## Option A : Déploiement GitHub + Vercel (recommandé)

### 1. Créer le repo GitHub

1. Aller sur https://github.com/new
2. Nom du repo : `ergotrack-pro`
3. Visibilité : **Private** (recommandé pour un outil SST interne)
4. Ne pas initialiser avec README (on push le nôtre)
5. Cliquer **Create repository**

### 2. Pousser le code

Ouvrir un terminal dans le dossier du projet :

```bash
git init
git add .
git commit -m "ErgoTrack PRO v3.0 - Initial deploy"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/ergotrack-pro.git
git push -u origin main
```

> Remplacer `TON_USERNAME` par ton nom d'utilisateur GitHub

### 3. Connecter Vercel à GitHub

1. Aller sur https://vercel.com/new
2. Cliquer **"Import Git Repository"**
3. Sélectionner `ergotrack-pro`
4. Framework Preset : **Other**
5. Root Directory : `.` (laisser par défaut)
6. Cliquer **Deploy**

Vercel détecte automatiquement `vercel.json` et déploie le site statique.

**Résultat :** URL publique du type `https://ergotrack-pro.vercel.app`

---

## Option B : Déploiement direct Vercel (sans GitHub)

### Via l'interface web

1. Aller sur https://vercel.com/new
2. Cliquer **"Browse All Templates"** → défiler vers le bas
3. Cliquer **"Deploy from CLI"** ou glisser-déposer le dossier entier
4. Suivre les instructions

### Via le CLI

```bash
# Installer le CLI Vercel
npm install -g vercel

# Dans le dossier du projet
cd ergotrack-pro
vercel deploy --prod
```

Se connecter avec le compte Vercel quand demandé (ouverture navigateur automatique).

---

## Option C : Mise à jour après modification

### Via GitHub (auto-deploy)
```bash
git add .
git commit -m "Update ErgoTrack - description des changements"
git push
```
Vercel redéploie automatiquement à chaque push sur `main`.

### Via CLI
```bash
vercel deploy --prod
```

---

## Structure des fichiers

```
ergotrack-pro/
├── index.html      ← Application complète (1 seul fichier)
├── vercel.json     ← Configuration Vercel
├── README.md       ← Documentation
├── DEPLOY.md       ← Ce guide
└── .gitignore      ← Fichiers exclus de Git
```

---

## URL personnalisée (domaine custom)

Dans Vercel Dashboard → Projet → Settings → Domains :
- Ajouter `ergotrack.alyzia.fr` (ou autre domaine)
- Suivre les instructions DNS

