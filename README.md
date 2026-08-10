# AuraMusic

Prima versione di un player musicale locale realizzato con React Native, Expo SDK 57 e TypeScript.

## Avvio su iPhone con Expo Go

1. Installa le dipendenze con `npm install`.
2. Avvia il progetto da Windows con `npx expo start`.
3. Apri Expo Go su iPhone e scansiona il QR code. PC e iPhone devono poter comunicare sulla stessa rete durante lo sviluppo.

Per aprire anche la versione web, premi `w` nel terminale. La configurazione Metro include il supporto WASM richiesto da `expo-sqlite`.

## Prova del flusso offline

1. Apri **Add Track** e tocca **Aggiungi alla libreria**.
2. AuraMusic copia l’asset `aura-test.m4a` nella directory persistente `Documents/music` e salva i metadata in SQLite.
3. Apri **Library** e tocca il brano: il player usa il suo `file://` locale.
4. Dopo che il progetto è caricato in Expo Go, disattiva la connessione Internet e prova nuovamente play/pausa e seek. La riproduzione del brano non effettua richieste di rete.

## Struttura

- `src/models`: modello `Track`.
- `src/database`: migrazioni e repository SQLite.
- `src/audio`: stato e comandi del player `expo-audio`.
- `src/services`: interfaccia `DownloadService` (`getInfo` / `downloadAudio`) e implementazione MOCK per l’asset incluso.
- `src/library`: stato applicativo della libreria.
- `src/app`: schermate Expo Router `Library`, `Player` e `Add Track`.

Questa versione non contiene YouTube, `yt-dlp` o codice nativo. In futuro l’implementazione di `DownloadService` potrà essere sostituita senza modificare database, player o UI.

Sul web il MOCK riproduce l’asset del bundle e SQLite conserva i metadata nel browser, ma non esiste una vera directory `Documents/music`: la copia persistente e la garanzia offline vanno verificate su iOS tramite Expo Go.

## Test del modulo iOS locale

La sezione **Debug** in **Add Track** espone il pulsante **Test native module**. Il modulo locale `AuraNativeTest` usa Expo Modules API e su iOS restituisce da Swift `Hello from native iOS`.

Il modulo custom non è incluso in Expo Go: per eseguire il codice Swift serve una development build. Su web lo stesso pulsante usa il fallback `Native iOS module unavailable on web`; su Expo Go mostra un errore gestito che invita a installare la development build.

## Controlli di progetto

```powershell
npx tsc --noEmit
npm run lint
npx expo export --platform ios
```
