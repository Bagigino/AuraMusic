# AuraMusic

Player musicale locale realizzato con React Native, Expo SDK 57 e TypeScript.

Su iOS la schermata **Search** usa yt-dlp embedded per trovare normali video
YouTube senza API key. Selezionando un risultato si apre il flow **Add Track** già
esistente, che analizza il video, scarica esclusivamente un formato M4A audio-only
e salva il Track in SQLite. Library e Player lavorano poi soltanto con il
`localUri` in `Documents/music`, quindi il brano resta riproducibile offline.

La build web mantiene intenzionalmente il servizio mock con l'asset M4A di test:
non esegue CPython, yt-dlp o download YouTube nel browser.

## Flusso iOS

1. Apri **Search**, inserisci una query e premi **Search**.
2. Seleziona un risultato per eseguire l'Analyze completo e vedere la preview.
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
- `src/services`: servizi separati per ricerca e download, con implementazioni iOS
  native e fallback web.
- `src/library`: orchestrazione Library, persistenza, duplicati e verifica file.
- `src/app`: tab Expo Router `Library`, `Search`, `Player` e route nascosta `Add Track`.
- `modules/aura-native-test`: local Expo Module, Swift e runtime Python embedded.
- `tests`: test JS senza rete e con adapter nativo simulato.

I dettagli dell'integrazione reale sono in
[`docs/REAL_IOS_DOWNLOAD_INTEGRATION.md`](docs/REAL_IOS_DOWNLOAD_INTEGRATION.md).
La ricerca testuale è documentata in
[`docs/YOUTUBE_SEARCH.md`](docs/YOUTUBE_SEARCH.md).

## Esecuzione web

```powershell
npm ci
npx expo start --web
```

Sul web Search mostra un errore controllato e non esegue yt-dlp. La route
`/add-track` mantiene l'URL mock per i test del flusso browser; SQLite persiste i
metadata nel browser, ma il filesystem iOS va verificato nella build nativa.

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
