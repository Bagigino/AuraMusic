export type AtomicLibraryReplaceOperations = {
  runTransaction(task: () => Promise<void>): Promise<void>;
  currentFilesExist(): boolean;
  moveCurrentFilesToRollback(): Promise<void>;
  activatePreparedFiles(): Promise<void>;
  replaceDatabaseRows(): Promise<void>;
  removeActivatedFiles(): Promise<void>;
  restoreRollbackFiles(): Promise<void>;
  cleanupRollbackFiles(): Promise<void>;
};

export class BackupRollbackError extends Error {
  readonly code = 'ROLLBACK_FAILED';
  readonly originalError: unknown;
  readonly rollbackError: unknown;

  constructor(originalError: unknown, rollbackError: unknown) {
    super(
      'Il ripristino non e riuscito e AuraMusic non ha potuto completare automaticamente il rollback dei file.',
    );
    this.name = 'BackupRollbackError';
    this.originalError = originalError;
    this.rollbackError = rollbackError;
  }
}

export async function runAtomicLibraryReplace(operations: AtomicLibraryReplaceOperations) {
  let movedCurrentFiles = false;
  let activatedPreparedFiles = false;

  try {
    await operations.runTransaction(async () => {
      if (operations.currentFilesExist()) {
        await operations.moveCurrentFilesToRollback();
        movedCurrentFiles = true;
      }
      await operations.activatePreparedFiles();
      activatedPreparedFiles = true;
      await operations.replaceDatabaseRows();
    });
  } catch (error) {
    try {
      if (activatedPreparedFiles) {
        await operations.removeActivatedFiles();
      }
      if (movedCurrentFiles) {
        await operations.restoreRollbackFiles();
      }
    } catch (rollbackError) {
      throw new BackupRollbackError(error, rollbackError);
    }
    throw error;
  }

  if (movedCurrentFiles) {
    await operations.cleanupRollbackFiles();
  }
}
