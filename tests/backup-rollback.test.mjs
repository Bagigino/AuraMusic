import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BackupRollbackError,
  runAtomicLibraryReplace,
} from '../src/backup/atomic-library-replace.ts';

function operations(overrides = {}) {
  const events = [];
  return {
    events,
    value: {
      async runTransaction(task) {
        events.push('begin');
        try {
          await task();
          events.push('commit');
        } catch (error) {
          events.push('rollback-db');
          throw error;
        }
      },
      currentFilesExist: () => true,
      async moveCurrentFilesToRollback() { events.push('old-to-rollback'); },
      async activatePreparedFiles() { events.push('prepared-to-current'); },
      async replaceDatabaseRows() { events.push('replace-rows'); },
      async removeActivatedFiles() { events.push('remove-new'); },
      async restoreRollbackFiles() { events.push('rollback-to-current'); },
      async cleanupRollbackFiles() { events.push('cleanup-rollback'); },
      ...overrides,
    },
  };
}

test('successful atomic replace commits rows before deleting the old file rollback', async () => {
  const fixture = operations();
  await runAtomicLibraryReplace(fixture.value);
  assert.deepEqual(fixture.events, [
    'begin',
    'old-to-rollback',
    'prepared-to-current',
    'replace-rows',
    'commit',
    'cleanup-rollback',
  ]);
});

test('database failure removes new files and restores the previous music directory', async () => {
  const failure = new Error('SQLite insert failed');
  const fixture = operations({ async replaceDatabaseRows() { throw failure; } });
  await assert.rejects(() => runAtomicLibraryReplace(fixture.value), failure);
  assert.deepEqual(fixture.events, [
    'begin',
    'old-to-rollback',
    'prepared-to-current',
    'rollback-db',
    'remove-new',
    'rollback-to-current',
  ]);
});

test('rollback failure is surfaced explicitly', async () => {
  const fixture = operations({
    async replaceDatabaseRows() { throw new Error('SQLite insert failed'); },
    async restoreRollbackFiles() { throw new Error('filesystem rollback failed'); },
  });
  await assert.rejects(
    () => runAtomicLibraryReplace(fixture.value),
    (error) => error instanceof BackupRollbackError && error.code === 'ROLLBACK_FAILED',
  );
});
