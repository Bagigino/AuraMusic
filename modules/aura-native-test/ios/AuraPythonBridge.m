#import "AuraPythonBridge.h"

#import <Python/Python.h>
#import <os/log.h>

static NSString *AuraPythonInitializationError = nil;
static dispatch_once_t AuraPythonInitializationOnce;

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
      !AuraAppendModulePath(&config, applicationCode, &pathError)) {
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
