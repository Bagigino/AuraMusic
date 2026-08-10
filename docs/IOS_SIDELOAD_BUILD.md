# Build iOS non firmata con GitHub Actions

Il workflow **.github/workflows/build-ios-unsigned.yml** genera su un runner macOS una build Release per iphoneos, senza certificati o provisioning profile. La cartella **ios/** viene creata in CI tramite Expo Prebuild e rimane esclusa dal repository secondo il modello Continuous Native Generation.

## Avviare il workflow

1. Pubblica su GitHub il branch che contiene il workflow e il modulo locale **modules/aura-native-test**.
2. Apri il repository su GitHub e seleziona **Actions**.
3. Apri **Build unsigned iOS IPA**.
4. Seleziona **Run workflow**, scegli il branch e conferma.
5. Attendi che il job **Build unsigned iOS IPA** termini correttamente.

Il Job Summary mostra i valori rilevati dopo Expo Prebuild: workspace, scheme, bundle identifier, percorso del bundle .app e percorso dell’IPA.

## Scaricare AuraMusic.ipa

1. Apri l’esecuzione completata nella sezione **Actions**.
2. In fondo alla pagina, nella sezione **Artifacts**, scarica **AuraMusic-unsigned-ipa**.
3. Estrai lo ZIP dell’artifact per ottenere **AuraMusic.ipa**.

L’artifact viene conservato per 14 giorni.

## Firma e installazione

**AuraMusic.ipa è intenzionalmente non firmata.** Non può essere installata direttamente su iPhone: la firma e l’installazione verranno eseguite successivamente da Windows con Sideloadly.

Il workflow:

- non usa certificati Apple;
- non usa provisioning profile;
- non richiede Apple Developer secrets;
- non invia credenziali Apple a GitHub;
- non esegue EAS Build.

Eventuali credenziali e limiti applicati da Sideloadly restano esterni a GitHub Actions.

## Verifiche incluse

La pipeline fallisce se TypeScript, lint, Expo Prebuild, CocoaPods o xcodebuild falliscono. Verifica inoltre che:

- il bundle identifier sia **com.mariu.auramusic**;
- Expo Autolinking rilevi **AuraNativeTestModule**;
- CocoaPods installi **AuraNativeTest** come pod locale;
- il modulo sia presente nell’eseguibile iOS compilato;
- esista un solo bundle .app Release per iphoneos;
- AuraMusic.ipa venga creata e superi il controllo ZIP.

Il percorso di build è:

~~~text
$RUNNER_TEMP/AuraMusicDerivedData/Build/Products/Release-iphoneos/<nome-reale>.app
~~~

L’IPA viene creata in:

~~~text
$RUNNER_TEMP/AuraMusicUnsigned/AuraMusic.ipa
~~~
