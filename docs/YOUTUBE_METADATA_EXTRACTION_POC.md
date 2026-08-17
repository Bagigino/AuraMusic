# YouTube metadata extraction POC

Questo step valida esclusivamente la catena:

`TypeScript -> Expo Module -> Swift -> CPython embedded -> yt-dlp -> Apple WebKit -> YouTube metadata`

Non integra il risultato nella Library, in SQLite o nel `DownloadService` e non
implementa alcun download.

## API e risultato

Il metodo asincrono `extractYouTubeInfo(url)` accetta soltanto URL HTTPS con host
`youtube.com`, `www.youtube.com`, `m.youtube.com` o `youtu.be`. Il risultato
TypeScript contiene:

- `id`, `title`, `uploader`, `duration`, `thumbnail`, `webpageUrl`;
- `audioFormats` con soli `formatId`, `ext`, `audioCodec`, `bitrate` e `fileSize`;
- `hasM4aAudio` e `preferredM4aFormatId`.

Un formato è audio-only quando yt-dlp restituisce `vcodec == "none"` e un
`acodec` valorizzato e diverso da `"none"`. Il candidato M4A preferito è quello
con `abr` più alto; dimensione stimata e format ID sono usati solo per rendere
deterministico il confronto in caso di parità.

Il DTO non contiene URL diretti dei formati, cookie, header, firme o manifest.
Gli errori esposti a TypeScript hanno sempre `code` e `message`.

## Opzioni yt-dlp

Il modulo Python usa `YoutubeDL` con:

```python
{
    "quiet": True,
    "verbose": True,
    "skip_download": True,
    "simulate": True,
    "noplaylist": True,
    "socket_timeout": 25,
    "retries": 1,
    "extractor_retries": 1,
    "fragment_retries": 0,
    "cachedir": False,
    "logger": AuraYtDlpLogger(),
}
```

La chiamata è esplicitamente `ydl.extract_info(url, download=False)`. Non sono
configurati postprocessor, output template, thumbnail writer, subtitle writer o
FFmpeg. `skip_download`, `simulate`, `download=False` e la cache disabilitata
impediscono la creazione di file media o cache yt-dlp da questo percorso.

Il bundle include `certifi==2026.7.22`, dipendenza Python pura usata da yt-dlp
per verificare i certificati TLS con l'OpenSSL embedded. Non è stata aggiunta
alcuna dipendenza nativa.

## Diagnostica

Prima di ogni estrazione viene riutilizzato il controllo già esistente del
provider `apple-webkit-jsi==0.1.1`. Il custom logger usa l'interfaccia ufficiale
`debug` / `warning` / `error` di yt-dlp e invia i dettagli al log di sistema iOS.
Le query degli URL e i valori che sembrano cookie, token o firme vengono
redatti. La UI mostra soltanto messaggi di errore sintetici.

Con il logging verbose, i log del dispositivo indicano l'extractor selezionato,
i provider JS Challenge registrati, gli eventuali tentativi di risoluzione e i
warning. Il preflight conferma che Apple WebKit è registrato e accessibile; solo
una prova con un video che richiede una challenge può confermare che il provider
sia stato effettivamente invocato per quella specifica estrazione.

## Prova su iPhone

1. Eseguire il workflow **Build unsigned iOS IPA** e installare la nuova IPA con
   la procedura di sideload già usata per i POC precedenti.
2. Aprire **Add Track**, raggiungere la sezione **Debug** e ripetere i quattro
   test preesistenti.
3. Incollare l'URL HTTPS di un video YouTube pubblico e premere
   **Extract YouTube metadata**.
4. Verificare titolo, uploader, durata, video ID, presenza thumbnail, formati
   audio-only e candidato M4A.
5. Controllare i log iOS per le righe con prefisso `[AuraMusic][yt-dlp]`.

Sul web il metodo restituisce `YouTube native extraction unavailable on web` e
non prova a caricare CPython o yt-dlp.
