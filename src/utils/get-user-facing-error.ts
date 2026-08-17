const ERROR_MESSAGES: Record<string, string> = {
  INVALID_URL: 'Inserisci un URL HTTPS YouTube valido.',
  NO_M4A_FORMAT: 'Non e disponibile un formato M4A audio-only compatibile.',
  INVALID_FORMAT_ID: 'Il formato M4A selezionato non e piu disponibile.',
  NETWORK_ERROR: 'YouTube non e raggiungibile. Controlla la connessione.',
  NETWORK_TIMEOUT: 'La richiesta a YouTube ha superato il timeout.',
  TLS_ERROR: 'La connessione sicura a YouTube non e riuscita.',
  MEDIA_ACCESS_DENIED:
    'YouTube ha rifiutato l’accesso diretto al formato M4A selezionato.',
  YOUTUBE_RATE_LIMITED:
    'YouTube ha temporaneamente limitato le richieste. Riprova piu tardi.',
  YOUTUBE_HTTP_ERROR: 'YouTube ha restituito un errore durante il download.',
  JS_CHALLENGE_ERROR: 'La challenge YouTube non e stata risolta.',
  APPLE_PROVIDER_UNAVAILABLE: 'Il provider Apple WebKit non e disponibile.',
  PRIVATE_VIDEO: 'Il video YouTube e privato.',
  RESTRICTED_VIDEO: 'Il video richiede accesso o e soggetto a restrizioni.',
  VIDEO_UNAVAILABLE: 'Il video non esiste piu o non e disponibile.',
  UNSUPPORTED_URL: 'yt-dlp non riconosce questo URL YouTube.',
  EXTRACTOR_ERROR: 'yt-dlp non e riuscito ad analizzare il video.',
  DOWNLOAD_INTERRUPTED: 'Il download e stato interrotto.',
  DOWNLOAD_IN_PROGRESS: 'Un download audio e gia in corso.',
  DISK_FULL: 'Spazio insufficiente sul dispositivo.',
  FILESYSTEM_ERROR: 'Non e stato possibile salvare il file audio.',
  FINAL_FILE_MISSING: 'Il file M4A finale non e stato trovato.',
  INVALID_DOWNLOAD_RESULT: 'Il modulo nativo ha restituito un file inatteso.',
  INVALID_NATIVE_RESPONSE: 'Il modulo nativo ha restituito una risposta non valida.',
  NATIVE_BRIDGE_ERROR: 'Il bridge nativo non ha completato l’operazione.',
  NATIVE_UNAVAILABLE: 'Il download nativo non e disponibile su questa piattaforma.',
  PYTHON_ERROR: 'Il runtime Python non ha completato il download.',
  UNSAFE_LOCAL_PATH: 'Il file scaricato non si trova nella directory gestita.',
  EXISTING_FILE_INVALID: 'Il file M4A esistente e vuoto o non valido.',
  DUPLICATE_TRACK: 'Questo brano e gia presente nella libreria.',
  SQLITE_SAVE_FAILED:
    'Il file e stato scaricato, ma il salvataggio nella Library e fallito.',
};

type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

export function getUserFacingError(error: unknown): string {
  const errorLike = error as ErrorLike | null;
  const code = typeof errorLike?.code === 'string' ? errorLike.code : null;

  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }
  if (typeof errorLike?.message === 'string' && errorLike.message.trim()) {
    if (
      errorLike.message.includes('FunctionCallException') ||
      errorLike.message.includes('ExpoModulesCore/')
    ) {
      return 'Il modulo nativo non ha completato l’operazione.';
    }
    return errorLike.message;
  }
  return 'Si e verificato un errore inatteso.';
}
