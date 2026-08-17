import assert from 'node:assert/strict';
import test from 'node:test';

import { getUserFacingError } from '../src/utils/get-user-facing-error.ts';

test('maps native download codes without exposing the Expo exception stack', () => {
  const error = Object.assign(
    new Error(
      "FunctionCallException: Calling the 'downloadYouTubeM4a' function has failed " +
        '-> Caused by: MEDIA_ACCESS_DENIED: internal details',
    ),
    { code: 'MEDIA_ACCESS_DENIED' },
  );

  assert.equal(
    getUserFacingError(error),
    'YouTube ha rifiutato l’accesso diretto al formato M4A selezionato.',
  );
});

test('maps an incomplete or duplicated M4A to a retryable message', () => {
  assert.equal(
    getUserFacingError(Object.assign(new Error('native details'), { code: 'INVALID_MEDIA_FILE' })),
    'Il file M4A scaricato risulta incompleto. Riprova il download.',
  );
});

test('keeps a useful message for unknown non-native errors', () => {
  assert.equal(getUserFacingError(new Error('SQLite unavailable')), 'SQLite unavailable');
});

test('does not expose an unmapped Expo native stack in the UI', () => {
  assert.equal(
    getUserFacingError(
      new Error(
        "FunctionCallException: Calling the 'downloadYouTubeM4a' function has failed " +
          '(at ExpoModulesCore/AsyncFunctionDefinition.swift:123)',
      ),
    ),
    'Il modulo nativo non ha completato l’operazione.',
  );
});

test('returns a safe fallback for values that are not errors', () => {
  assert.equal(getUserFacingError(null), 'Si e verificato un errore inatteso.');
});
