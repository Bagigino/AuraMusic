# Proof of concept: import yt-dlp nel runtime iOS

Questo step include staticamente **yt-dlp 2026.07.04** nel bundle dell'app e
verifica esclusivamente questa catena:

~~~text
TypeScript → Expo Module → Swift → Objective-C → CPython embedded
→ import yt_dlp → yt_dlp.version.__version__ → TypeScript
~~~

Non esegue richieste di rete, `extract_info()`, download o conversioni. Non
include yt-dlp-ejs, QuickJS, Deno, Node come runtime Python, FFmpeg o dipendenze
Python opzionali di yt-dlp.

Questa descrizione resta riferita al POC di solo import. Il successivo POC di
rete aggiunge esclusivamente la dipendenza Python pura `certifi`, come descritto
in `docs/YOUTUBE_METADATA_EXTRACTION_POC.md`; continua a non installare i runtime
o gli strumenti esclusi sopra.

## Vendoring in CI

Il workflow prepara una directory ignorata da Git:

~~~text
modules/aura-native-test/python-vendor/
~~~

Il comando di vendoring equivalente è:

~~~bash
python3 -m pip install \
  --disable-pip-version-check \
  --target modules/aura-native-test/python-vendor \
  --no-compile \
  --no-deps \
  'yt-dlp==2026.07.04'
~~~

`--no-deps` impedisce l'installazione delle dipendenze opzionali e
`--no-compile` evita bytecode generato dal Python usato come strumento di build.
Subito dopo, la CI elimina soltanto `bin/` e `share/` dalla directory appena
generata, perché launcher CLI, completamenti shell e man page non sono
utilizzabili nell'interprete embedded. Restano `yt_dlp/` e i relativi metadata
`dist-info`, inclusi i file di licenza.
Il workflow importa il package con il Python del runner, legge realmente
`yt_dlp.version.__version__` e richiede che sia `2026.07.04`.

## Bundle e runtime

Il config plugin CNG copia il package in:

~~~text
AuraMusic.app/python-vendor/yt_dlp/
~~~

La configurazione isolata di CPython aggiunge
`AuraMusic.app/python-vendor` alla propria lista di module search path, oltre
alla standard library, a `lib-dynload` e al codice applicativo già esistenti.
Non viene inizializzato un secondo interprete.

Un import completo di `yt_dlp` carica anche moduli standard CPython come
`ssl`, `socket`, `ctypes`, `select` e `unicodedata`. La build conserva quindi
le estensioni standard iOS e usa le build libffi/OpenSSL indicate dal sistema
di build Apple ufficiale di CPython. L'helper Xcode di CPython le converte in
framework caricabili da iOS. Poiché la build dell'app ha il code signing
disabilitato, tali framework ricevono soltanto una firma ad-hoc locale richiesta
dall'helper; non vengono usati certificati o provisioning profile e Sideloadly
la sostituirà durante la firma finale.

## Bridge e gestione errori

`testYtDlpImport()` acquisisce il GIL dello stesso interprete, esegue davvero
`import yt_dlp` e `import yt_dlp.version`, poi legge `__version__` tramite la
Python C API. Swift restituisce a TypeScript un record `{ success, version }`.

Se Python solleva un'eccezione, il bridge la normalizza, restituisce un messaggio
leggibile al chiamante Expo e ripristina temporaneamente l'eccezione per
inviare il traceback completo al system log iOS con `PyErr_Print()`.

## Compilare e provare

1. Aprire **Actions** nel repository GitHub.
2. Avviare manualmente **Build unsigned iOS IPA**.
3. Scaricare l'artifact **AuraMusic-unsigned-ipa**.
4. Firmare e installare `AuraMusic.ipa` da Windows con Sideloadly.
5. Aprire la sezione Debug e verificare prima **Test Python**, poi premere
   **Test yt-dlp**.
6. Il risultato atteso sul dispositivo è
   **yt-dlp imported: 2026.07.04**.

L'IPA resta intenzionalmente non firmata dal workflow. Questo POC è validato
definitivamente solo dopo l'esecuzione del test su un iPhone reale.
