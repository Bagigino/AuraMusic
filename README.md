# AuraMusic

Player musicale locale realizzato con React Native, Expo SDK 57 e TypeScript.

Su iOS la schermata **Add Track** usa il `DownloadService` reale per analizzare un
URL YouTube, scaricare esclusivamente un formato M4A audio-only e salvare il Track
in SQLite. La Library e il Player lavorano poi soltanto con il `localUri` del file
in `Documents/music`, quindi il brano resta riproducibile offline dopo il riavvio.

La build web mantiene intenzionalmente il servizio mock con l'asset M4A di test:
non esegue CPython, yt-dlp o download YouTube nel browser.

## Flusso iOS

1. Apri **Add Track** e incolla un URL HTTPS YouTube.
2. Premi **Analyze** per vedere titolo, uploader, durata, thumbnail e disponibilità
   M4A.
3. Premi **Download** e attendi le fasi `downloading` e `saving`.
4. Apri **Library** e seleziona il Track: il Player usa il file M4A locale.
5. Per verificare l'offline, chiudi l'app, abilita la modalità aereo, riaprila e
   riproduci nuovamente il Track.

La sezione **Debug** in Add Track rimane disponibile per i test isolati del modulo
nativo, di CPython, yt-dlp, Apple WebKit, metadata e download M4A.

## Struttura

- `src/models`: modello persistente `Track`.
- `src/database`: migrazione e repository SQLite.
- `src/storage`: accesso controllato alla directory musicale gestita.
- `src/audio`: stato e comandi del player `expo-audio`.
- `src/services`: contratto `DownloadService`, implementazione iOS nativa e mock web.
- `src/library`: orchestrazione Library, persistenza, duplicati e verifica file.
- `src/app`: schermate Expo Router `Library`, `Player` e `Add Track`.
- `modules/aura-native-test`: local Expo Module, Swift e runtime Python embedded.
- `tests`: test JS senza rete e con adapter nativo simulato.

I dettagli dell'integrazione reale sono in
[`docs/REAL_IOS_DOWNLOAD_INTEGRATION.md`](docs/REAL_IOS_DOWNLOAD_INTEGRATION.md).

## Esecuzione web

```powershell
npm ci
npx expo start --web
```

Sul web usa l'URL mock già presente in Add Track. SQLite persiste i metadata nel
browser, ma il comportamento filesystem iOS va verificato nella build nativa.

## Build iOS unsigned

Il workflow `.github/workflows/build-ios-unsigned.yml` genera con Expo Prebuild una
Release `iphoneos` non firmata, crea `AuraMusic.ipa` e la pubblica come artifact.
Consulta [`docs/IOS_SIDELOAD_BUILD.md`](docs/IOS_SIDELOAD_BUILD.md) per il flusso
GitHub Actions → IPA unsigned → Sideloadly.

## Controlli di progetto

```powershell
npx tsc --noEmit
npm run lint
npm test
npx expo export --platform web
```
