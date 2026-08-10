# Proof of concept CPython embedded su iOS

Questo step integra **CPython 3.14.7** in modalità embedded esclusivamente per dimostrare la catena:

~~~text
TypeScript → Expo Module → Swift → Objective-C → CPython → aura_test.py → 4
~~~

Non include yt-dlp, yt-dlp-ejs, QuickJS, FFmpeg, YouTube, download audio o `pip` a runtime.

## Origine e build di CPython

Il workflow scarica il source tarball ufficiale `Python-3.14.7.tar.xz` da `python.org` e ne verifica il digest SHA-256 ufficiale:

~~~text
3b48dac8fb59f62eaa67ac83c1eb12bda1b7a08406dd286e252c11a66be27f81
~~~

Lo script `scripts/build-cpython-ios.sh` compila prima lo stesso sorgente per macOS, da usare come build interpreter, poi esegue il cross-build documentato da CPython per `arm64-apple-ios` con deployment target iOS 16.4. Infine crea `Python.xcframework` con `xcodebuild -create-xcframework`.

Non viene scaricato un XCFramework precompilato e non vengono scaricati binari da repository di terze parti. Per questo POC non sono incluse dipendenze native opzionali di CPython; le estensioni `.so` della standard library vengono escluse dal bundle. Il calcolo `2 + 2`, gli import puramente Python e il runtime CPython restano reali.

Il framework risultante viene conservato dalla cache GitHub Actions con una chiave che comprende versione CPython e hash dello script di build. È volutamente limitato al device iOS arm64 e non supporta il simulatore.

## Integrazione Expo CNG

`Python.xcframework` viene generato in:

~~~text
modules/aura-native-test/ios/Python.xcframework
~~~

La directory è ignorata da Git e viene preparata in CI prima di `expo prebuild`.

Il podspec locale `AuraNativeTest.podspec` dichiara l'XCFramework come `vendored_framework`. Il config plugin `modules/aura-native-test/plugin/withAuraPython.js` viene eseguito da Expo Prebuild e:

- disabilita lo user script sandboxing richiesto dalla procedura CPython;
- aggiunge la fase Xcode **Install embedded CPython** dopo Copy Bundle Resources;
- copia `modules/aura-native-test/python/aura_test.py` in `AuraMusic.app/app`;
- usa l'helper Xcode fornito dai sorgenti CPython per copiare la standard library in `AuraMusic.app/python`.

La cartella `ios/` continua quindi a essere interamente rigenerabile e non deve essere versionata.

## Runtime

`AuraPythonBridge.m` usa direttamente la Python C API. Alla prima chiamata:

- abilita UTF-8 mode con `PyPreConfig`;
- usa `PyConfig_InitIsolatedConfig`;
- disabilita buffered stdio e scrittura bytecode;
- abilita signal handlers e system logger;
- imposta Python home su `AuraMusic.app/python`;
- imposta i module search path per standard library, `lib-dynload` e `AuraMusic.app/app`;
- inizializza CPython una sola volta con `dispatch_once`;
- lascia l'interprete vivo e rilascia il GIL per le chiamate successive.

Ogni test acquisisce il GIL, importa `aura_test`, invoca `add_two_plus_two()` e converte il `PyLong` restituito in `NSInteger`, poi in `Int` Swift e infine in `number` TypeScript. Le eccezioni Python diventano errori leggibili e vengono anche inviate al log di sistema.

## Compilare e installare

1. Eseguire il workflow **Build unsigned iOS IPA** da GitHub Actions con **Run workflow**.
2. Alla prima esecuzione attendere anche il cross-build di CPython; le successive possono riusare la cache.
3. Scaricare l'artifact **AuraMusic-unsigned-ipa**.
4. Estrarre `AuraMusic.ipa` e firmarla/installarla da Windows con Sideloadly come già fatto per AuraNativeTest.
5. Aprire Add Track, raggiungere la sezione Debug e premere **Test Python**.
6. Verificare il testo **Python result: 4**.

L'IPA rimane intenzionalmente non firmata e il workflow non usa certificati, provisioning profile o credenziali Apple.

## Verifiche CI

La pipeline controlla esplicitamente:

- framework arm64, helper CPython e standard library prima di Prebuild;
- fase Xcode prodotta dal config plugin;
- dichiarazione di `Python.xcframework` nel pod locale;
- `Python.framework/Python` nel bundle `.app` finale;
- `python/lib/python3.14/encodings/__init__.py` nel bundle;
- `app/aura_test.py` nel bundle;
- load command del binario AuraMusic verso `Python.framework/Python`.

## Limiti del POC

- solo iPhone/iPad fisico arm64; nessuna slice simulator;
- standard library senza moduli binari `.so` opzionali;
- nessuna installazione di pacchetti e nessun `pip` a runtime;
- interprete mantenuto per tutta la vita del processo, senza `Py_Finalize`;
- una sola piccola funzione Python inclusa, limitata al test richiesto.
