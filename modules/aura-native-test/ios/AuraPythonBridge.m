#import "AuraPythonBridge.h"

#import <Python/Python.h>
#import <os/log.h>

static NSString *AuraPythonInitializationError = nil;
static dispatch_once_t AuraPythonInitializationOnce;
static const char *AuraProgressCapsuleName = "AuraMusic.DownloadProgressHandler";

static void AuraProgressCapsuleDestructor(PyObject *capsule) {
  void *retainedHandler = PyCapsule_GetPointer(capsule, AuraProgressCapsuleName);
  if (retainedHandler != NULL) {
    CFRelease(retainedHandler);
  } else {
    PyErr_Clear();
  }
}

static PyObject *AuraEmitDownloadProgress(PyObject *self, PyObject *arguments) {
  PyObject *progressJSON = NULL;
  if (!PyArg_ParseTuple(arguments, "U", &progressJSON)) {
    return NULL;
  }

  void *retainedHandler = PyCapsule_GetPointer(self, AuraProgressCapsuleName);
  if (retainedHandler == NULL) {
    return NULL;
  }

  const char *progressUTF8 = PyUnicode_AsUTF8(progressJSON);
  if (progressUTF8 == NULL) {
    return NULL;
  }

  NSString *progress = [NSString stringWithUTF8String:progressUTF8];
  if (progress == nil) {
    PyErr_SetString(PyExc_ValueError, "Progress JSON is not valid UTF-8.");
    return NULL;
  }

  AuraDownloadProgressHandler handler = (__bridge AuraDownloadProgressHandler)retainedHandler;
  handler(progress);
  Py_RETURN_NONE;
}

static PyMethodDef AuraProgressMethodDefinition = {
  "emit_progress",
  AuraEmitDownloadProgress,
  METH_VARARGS,
  "Forwards a sanitized yt-dlp progress payload to the Expo module."
};

static NSString *AuraMessageFromStatus(PyStatus status) {
  if (status.err_msg != NULL) {
    return [NSString stringWithUTF8String:status.err_msg];
  }

  if (PyStatus_IsExit(status)) {
    return [NSString stringWithFormat:@"CPython ha richiesto l'uscita con codice %d.", status.exitcode];
  }

  return @"Errore sconosciuto durante l'inizializzazione di CPython.";
}

static BOOL AuraAppendModulePath(PyConfig *config, NSString *path, NSString **errorMessage) {
  wchar_t *widePath = Py_DecodeLocale(path.fileSystemRepresentation, NULL);
  if (widePath == NULL) {
    *errorMessage = [NSString stringWithFormat:@"Impossibile convertire il percorso Python: %@", path];
    return NO;
  }

  PyStatus status = PyWideStringList_Append(&config->module_search_paths, widePath);
  PyMem_RawFree(widePath);

  if (PyStatus_Exception(status)) {
    *errorMessage = AuraMessageFromStatus(status);
    return NO;
  }

  return YES;
}

static NSString *AuraCurrentPythonException(void) {
  PyObject *type = NULL;
  PyObject *value = NULL;
  PyObject *traceback = NULL;
  PyErr_Fetch(&type, &value, &traceback);
  PyErr_NormalizeException(&type, &value, &traceback);

  PyObject *description = PyObject_Str(value != NULL ? value : type);
  const char *utf8Description = description != NULL ? PyUnicode_AsUTF8(description) : NULL;
  NSString *message = utf8Description != NULL
    ? [NSString stringWithUTF8String:utf8Description]
    : @"Eccezione Python senza descrizione.";

  // Restore a retained copy so PyErr_Print can send the complete Python
  // traceback to CPython's configured iOS system logger.
  if (type != NULL) {
    Py_XINCREF(type);
    Py_XINCREF(value);
    Py_XINCREF(traceback);
    PyErr_Restore(type, value, traceback);
    PyErr_Print();
  }

  Py_XDECREF(description);
  Py_XDECREF(traceback);
  Py_XDECREF(value);
  Py_XDECREF(type);
  return message;
}

static void AuraInitializePython(void) {
  NSString *resourcePath = NSBundle.mainBundle.resourcePath;
  NSString *pythonHome = [resourcePath stringByAppendingPathComponent:@"python"];
  NSString *standardLibrary = [pythonHome stringByAppendingPathComponent:@"lib/python3.14"];
  NSString *dynamicLibrary = [standardLibrary stringByAppendingPathComponent:@"lib-dynload"];
  NSString *applicationCode = [resourcePath stringByAppendingPathComponent:@"app"];
  NSString *vendoredPackages = [resourcePath stringByAppendingPathComponent:@"python-vendor"];

  NSFileManager *fileManager = NSFileManager.defaultManager;
  if (![fileManager fileExistsAtPath:[standardLibrary stringByAppendingPathComponent:@"encodings/__init__.py"]]) {
    AuraPythonInitializationError = @"La standard library CPython non è presente nel bundle dell'app.";
    return;
  }

  if (![fileManager fileExistsAtPath:[applicationCode stringByAppendingPathComponent:@"aura_test.py"]]) {
    AuraPythonInitializationError = @"Il codice Python di test non è presente nel bundle dell'app.";
    return;
  }

  PyPreConfig preconfig;
  PyPreConfig_InitIsolatedConfig(&preconfig);
  preconfig.utf8_mode = 1;

  PyStatus status = Py_PreInitialize(&preconfig);
  if (PyStatus_Exception(status)) {
    AuraPythonInitializationError = AuraMessageFromStatus(status);
    return;
  }

  PyConfig config;
  PyConfig_InitIsolatedConfig(&config);
  config.buffered_stdio = 0;
  config.write_bytecode = 0;
  config.install_signal_handlers = 1;
  config.use_system_logger = 1;
  config.module_search_paths_set = 1;

  status = PyConfig_SetBytesString(&config, &config.home, pythonHome.fileSystemRepresentation);
  if (PyStatus_Exception(status)) {
    AuraPythonInitializationError = AuraMessageFromStatus(status);
    PyConfig_Clear(&config);
    return;
  }

  NSString *pathError = nil;
  if (!AuraAppendModulePath(&config, standardLibrary, &pathError) ||
      !AuraAppendModulePath(&config, dynamicLibrary, &pathError) ||
      !AuraAppendModulePath(&config, applicationCode, &pathError) ||
      !AuraAppendModulePath(&config, vendoredPackages, &pathError)) {
    AuraPythonInitializationError = pathError;
    PyConfig_Clear(&config);
    return;
  }

  status = Py_InitializeFromConfig(&config);
  PyConfig_Clear(&config);

  if (PyStatus_Exception(status)) {
    AuraPythonInitializationError = AuraMessageFromStatus(status);
    return;
  }

  // The interpreter remains alive for the app lifetime. Release the GIL so
  // later calls can safely acquire it from any Expo worker thread.
  PyEval_SaveThread();
  os_log_info(OS_LOG_DEFAULT, "AuraMusic embedded CPython initialized");
}

static void AuraAssignError(NSString **errorMessage, NSString *message) {
  os_log_error(OS_LOG_DEFAULT, "AuraMusic Python error: %{public}@", message);
  if (errorMessage != NULL) {
    *errorMessage = message;
  }
}

static PyObject *AuraPythonUnicodeFromString(NSString *value) {
  const char *utf8Value = value.UTF8String;
  if (utf8Value == NULL) {
    PyErr_SetString(PyExc_ValueError, "NSString cannot be represented as UTF-8.");
    return NULL;
  }
  return PyUnicode_DecodeUTF8(
    utf8Value,
    (Py_ssize_t)[value lengthOfBytesUsingEncoding:NSUTF8StringEncoding],
    "strict"
  );
}

NSInteger AuraTestPython(NSString * _Nullable * _Nullable errorMessage) {
  dispatch_once(&AuraPythonInitializationOnce, ^{
    AuraInitializePython();
  });

  if (AuraPythonInitializationError != nil || !Py_IsInitialized()) {
    AuraAssignError(errorMessage, AuraPythonInitializationError ?: @"CPython non è inizializzato.");
    return 0;
  }

  PyGILState_STATE gilState = PyGILState_Ensure();
  PyObject *module = PyImport_ImportModule("aura_test");
  if (module == NULL) {
    NSString *message = [NSString stringWithFormat:@"Import Python fallito: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return 0;
  }

  PyObject *function = PyObject_GetAttrString(module, "add_two_plus_two");
  if (function == NULL || !PyCallable_Check(function)) {
    NSString *detail = PyErr_Occurred() ? AuraCurrentPythonException() : @"add_two_plus_two non è callable.";
    Py_XDECREF(function);
    Py_DECREF(module);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, [NSString stringWithFormat:@"Funzione Python non valida: %@", detail]);
    return 0;
  }

  PyObject *pythonResult = PyObject_CallNoArgs(function);
  Py_DECREF(function);
  Py_DECREF(module);

  if (pythonResult == NULL) {
    NSString *message = [NSString stringWithFormat:@"Esecuzione Python fallita: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return 0;
  }

  long value = PyLong_AsLong(pythonResult);
  Py_DECREF(pythonResult);

  if (value == -1 && PyErr_Occurred()) {
    NSString *message = [NSString stringWithFormat:@"Conversione del risultato Python fallita: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return 0;
  }

  PyGILState_Release(gilState);
  return value;
}

NSString * _Nullable AuraTestYtDlpImport(NSString * _Nullable * _Nullable errorMessage) {
  dispatch_once(&AuraPythonInitializationOnce, ^{
    AuraInitializePython();
  });

  if (AuraPythonInitializationError != nil || !Py_IsInitialized()) {
    AuraAssignError(errorMessage, AuraPythonInitializationError ?: @"CPython non è inizializzato.");
    return nil;
  }

  PyGILState_STATE gilState = PyGILState_Ensure();
  PyObject *package = PyImport_ImportModule("yt_dlp");
  if (package == NULL) {
    NSString *message = [NSString stringWithFormat:@"Import yt_dlp fallito: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  PyObject *versionModule = PyImport_ImportModule("yt_dlp.version");
  if (versionModule == NULL) {
    NSString *message = [NSString stringWithFormat:@"Import yt_dlp.version fallito: %@", AuraCurrentPythonException()];
    Py_DECREF(package);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  PyObject *versionValue = PyObject_GetAttrString(versionModule, "__version__");
  if (versionValue == NULL || !PyUnicode_Check(versionValue)) {
    NSString *detail = PyErr_Occurred()
      ? AuraCurrentPythonException()
      : @"yt_dlp.version.__version__ non è una stringa.";
    Py_XDECREF(versionValue);
    Py_DECREF(versionModule);
    Py_DECREF(package);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, [NSString stringWithFormat:@"Versione yt-dlp non valida: %@", detail]);
    return nil;
  }

  const char *versionUtf8 = PyUnicode_AsUTF8(versionValue);
  if (versionUtf8 == NULL) {
    NSString *message = [NSString stringWithFormat:@"Lettura versione yt-dlp fallita: %@", AuraCurrentPythonException()];
    Py_DECREF(versionValue);
    Py_DECREF(versionModule);
    Py_DECREF(package);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  NSString *version = [NSString stringWithUTF8String:versionUtf8];
  Py_DECREF(versionValue);
  Py_DECREF(versionModule);
  Py_DECREF(package);
  PyGILState_Release(gilState);

  if (version == nil) {
    AuraAssignError(errorMessage, @"La versione yt-dlp non è UTF-8 valida.");
    return nil;
  }

  return version;
}

BOOL AuraTestYtDlpAppleProvider(
  NSInteger * _Nullable success,
  NSString * _Nullable * _Nullable providerName,
  NSString * _Nullable * _Nullable version,
  NSString * _Nullable * _Nullable errorMessage
) {
  dispatch_once(&AuraPythonInitializationOnce, ^{
    AuraInitializePython();
  });

  if (AuraPythonInitializationError != nil || !Py_IsInitialized()) {
    AuraAssignError(errorMessage, AuraPythonInitializationError ?: @"CPython non è inizializzato.");
    return NO;
  }

  PyGILState_STATE gilState = PyGILState_Ensure();
  PyObject *module = PyImport_ImportModule("aura_yt_dlp_apple_provider");
  if (module == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Import del test Apple WebKit fallito: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return NO;
  }

  PyObject *function = PyObject_GetAttrString(module, "test_apple_webkit_provider");
  if (function == NULL || !PyCallable_Check(function)) {
    NSString *detail = PyErr_Occurred()
      ? AuraCurrentPythonException()
      : @"test_apple_webkit_provider non è callable.";
    Py_XDECREF(function);
    Py_DECREF(module);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, [NSString stringWithFormat:
      @"Funzione di test Apple WebKit non valida: %@", detail]);
    return NO;
  }

  PyObject *pythonResult = PyObject_CallNoArgs(function);
  Py_DECREF(function);
  Py_DECREF(module);

  if (pythonResult == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Test Apple WebKit fallito: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return NO;
  }

  if (!PyDict_Check(pythonResult)) {
    Py_DECREF(pythonResult);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, @"Il test Apple WebKit non ha restituito un dizionario.");
    return NO;
  }

  PyObject *successObject = PyDict_GetItemString(pythonResult, "success");
  PyObject *providerValue = PyDict_GetItemString(pythonResult, "provider");
  PyObject *versionValue = PyDict_GetItemString(pythonResult, "version");
  if (successObject == NULL || !PyBool_Check(successObject) ||
      providerValue == NULL || !PyUnicode_Check(providerValue) ||
      versionValue == NULL || !PyUnicode_Check(versionValue)) {
    Py_DECREF(pythonResult);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, @"Il risultato del test Apple WebKit non è valido.");
    return NO;
  }

  int resolvedSuccess = PyObject_IsTrue(successObject);
  if (resolvedSuccess < 0) {
    NSString *message = [NSString stringWithFormat:
      @"Lettura dello stato Apple WebKit fallita: %@", AuraCurrentPythonException()];
    Py_DECREF(pythonResult);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return NO;
  }

  const char *providerUtf8 = PyUnicode_AsUTF8(providerValue);
  const char *versionUtf8 = PyUnicode_AsUTF8(versionValue);
  if (providerUtf8 == NULL || versionUtf8 == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Lettura del risultato Apple WebKit fallita: %@", AuraCurrentPythonException()];
    Py_DECREF(pythonResult);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return NO;
  }

  NSString *resolvedProvider = [NSString stringWithUTF8String:providerUtf8];
  NSString *resolvedVersion = [NSString stringWithUTF8String:versionUtf8];
  Py_DECREF(pythonResult);
  PyGILState_Release(gilState);

  if (resolvedProvider == nil || resolvedVersion == nil) {
    AuraAssignError(errorMessage, @"Il risultato Apple WebKit non è UTF-8 valido.");
    return NO;
  }

  if (success != NULL) {
    *success = resolvedSuccess;
  }
  if (providerName != NULL) {
    *providerName = resolvedProvider;
  }
  if (version != NULL) {
    *version = resolvedVersion;
  }
  return YES;
}

NSString * _Nullable AuraExtractYouTubeInfo(
  NSString *url,
  NSString * _Nullable * _Nullable errorMessage
) {
  dispatch_once(&AuraPythonInitializationOnce, ^{
    AuraInitializePython();
  });

  if (AuraPythonInitializationError != nil || !Py_IsInitialized()) {
    AuraAssignError(errorMessage, AuraPythonInitializationError ?: @"CPython non è inizializzato.");
    return nil;
  }

  PyGILState_STATE gilState = PyGILState_Ensure();
  PyObject *module = PyImport_ImportModule("aura_youtube_metadata");
  if (module == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Import del modulo metadata YouTube fallito: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  PyObject *function = PyObject_GetAttrString(module, "extract_youtube_info_json");
  if (function == NULL || !PyCallable_Check(function)) {
    NSString *detail = PyErr_Occurred()
      ? AuraCurrentPythonException()
      : @"extract_youtube_info_json non è callable.";
    Py_XDECREF(function);
    Py_DECREF(module);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, [NSString stringWithFormat:
      @"Funzione metadata YouTube non valida: %@", detail]);
    return nil;
  }

  const char *urlUtf8 = url.UTF8String;
  Py_ssize_t urlLength = (Py_ssize_t)[url lengthOfBytesUsingEncoding:NSUTF8StringEncoding];
  PyObject *pythonUrl = urlUtf8 != NULL
    ? PyUnicode_DecodeUTF8(urlUtf8, urlLength, "strict")
    : NULL;
  if (pythonUrl == NULL) {
    NSString *detail = PyErr_Occurred()
      ? AuraCurrentPythonException()
      : @"L'URL non è UTF-8 valido.";
    Py_DECREF(function);
    Py_DECREF(module);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, [NSString stringWithFormat:
      @"Conversione URL YouTube fallita: %@", detail]);
    return nil;
  }

  PyObject *pythonResult = PyObject_CallOneArg(function, pythonUrl);
  Py_DECREF(pythonUrl);
  Py_DECREF(function);
  Py_DECREF(module);

  if (pythonResult == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Estrazione metadata YouTube fallita: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  if (!PyUnicode_Check(pythonResult)) {
    Py_DECREF(pythonResult);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, @"Il risultato metadata YouTube non è una stringa JSON.");
    return nil;
  }

  const char *resultUtf8 = PyUnicode_AsUTF8(pythonResult);
  if (resultUtf8 == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Lettura del JSON metadata YouTube fallita: %@", AuraCurrentPythonException()];
    Py_DECREF(pythonResult);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  NSString *result = [NSString stringWithUTF8String:resultUtf8];
  Py_DECREF(pythonResult);
  PyGILState_Release(gilState);

  if (result == nil) {
    AuraAssignError(errorMessage, @"Il JSON metadata YouTube non è UTF-8 valido.");
    return nil;
  }
  return result;
}

NSString * _Nullable AuraDownloadYouTubeM4a(
  NSString *url,
  NSString * _Nullable formatId,
  NSString *destinationDirectory,
  AuraDownloadProgressHandler _Nullable progressHandler,
  NSString * _Nullable * _Nullable errorMessage
) {
  dispatch_once(&AuraPythonInitializationOnce, ^{
    AuraInitializePython();
  });

  if (AuraPythonInitializationError != nil || !Py_IsInitialized()) {
    AuraAssignError(errorMessage, AuraPythonInitializationError ?: @"CPython non e inizializzato.");
    return nil;
  }

  PyGILState_STATE gilState = PyGILState_Ensure();
  PyObject *module = PyImport_ImportModule("aura_youtube_metadata");
  if (module == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Import del modulo download YouTube fallito: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  PyObject *function = PyObject_GetAttrString(module, "download_youtube_m4a_json");
  if (function == NULL || !PyCallable_Check(function)) {
    NSString *detail = PyErr_Occurred()
      ? AuraCurrentPythonException()
      : @"download_youtube_m4a_json non e callable.";
    Py_XDECREF(function);
    Py_DECREF(module);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, [NSString stringWithFormat:
      @"Funzione download YouTube non valida: %@", detail]);
    return nil;
  }

  PyObject *pythonUrl = AuraPythonUnicodeFromString(url);
  PyObject *pythonDestination = AuraPythonUnicodeFromString(destinationDirectory);
  PyObject *pythonFormatId = NULL;
  if (formatId != nil) {
    pythonFormatId = AuraPythonUnicodeFromString(formatId);
  } else {
    pythonFormatId = Py_NewRef(Py_None);
  }

  PyObject *pythonProgressHandler = NULL;
  if (progressHandler != nil) {
    AuraDownloadProgressHandler copiedHandler = [progressHandler copy];
    void *retainedHandler = (__bridge_retained void *)copiedHandler;
    PyObject *handlerCapsule = PyCapsule_New(
      retainedHandler,
      AuraProgressCapsuleName,
      AuraProgressCapsuleDestructor
    );
    if (handlerCapsule == NULL) {
      CFRelease(retainedHandler);
    } else {
      pythonProgressHandler = PyCFunction_NewEx(
        &AuraProgressMethodDefinition,
        handlerCapsule,
        NULL
      );
      Py_DECREF(handlerCapsule);
    }
  } else {
    pythonProgressHandler = Py_NewRef(Py_None);
  }

  if (pythonUrl == NULL || pythonDestination == NULL || pythonFormatId == NULL ||
      pythonProgressHandler == NULL) {
    NSString *detail = PyErr_Occurred()
      ? AuraCurrentPythonException()
      : @"Impossibile preparare gli argomenti Python.";
    Py_XDECREF(pythonProgressHandler);
    Py_XDECREF(pythonFormatId);
    Py_XDECREF(pythonDestination);
    Py_XDECREF(pythonUrl);
    Py_DECREF(function);
    Py_DECREF(module);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, [NSString stringWithFormat:
      @"Preparazione download YouTube fallita: %@", detail]);
    return nil;
  }

  PyObject *arguments = PyTuple_Pack(
    4,
    pythonUrl,
    pythonFormatId,
    pythonDestination,
    pythonProgressHandler
  );
  Py_DECREF(pythonProgressHandler);
  Py_DECREF(pythonFormatId);
  Py_DECREF(pythonDestination);
  Py_DECREF(pythonUrl);

  if (arguments == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Preparazione argomenti download fallita: %@", AuraCurrentPythonException()];
    Py_DECREF(function);
    Py_DECREF(module);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  PyObject *pythonResult = PyObject_CallObject(function, arguments);
  Py_DECREF(arguments);
  Py_DECREF(function);
  Py_DECREF(module);

  if (pythonResult == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Download M4A YouTube fallito: %@", AuraCurrentPythonException()];
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  if (!PyUnicode_Check(pythonResult)) {
    Py_DECREF(pythonResult);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, @"Il risultato download YouTube non e una stringa JSON.");
    return nil;
  }

  const char *resultUTF8 = PyUnicode_AsUTF8(pythonResult);
  if (resultUTF8 == NULL) {
    NSString *message = [NSString stringWithFormat:
      @"Lettura del JSON download YouTube fallita: %@", AuraCurrentPythonException()];
    Py_DECREF(pythonResult);
    PyGILState_Release(gilState);
    AuraAssignError(errorMessage, message);
    return nil;
  }

  NSString *result = [NSString stringWithUTF8String:resultUTF8];
  Py_DECREF(pythonResult);
  PyGILState_Release(gilState);

  if (result == nil) {
    AuraAssignError(errorMessage, @"Il JSON download YouTube non e UTF-8 valido.");
    return nil;
  }
  return result;
}
