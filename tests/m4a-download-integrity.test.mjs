import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pythonSourceUrl = new URL(
  '../modules/aura-native-test/python/aura_youtube_metadata.py',
  import.meta.url,
);

test('offline M4A selection is restricted to direct HTTPS media', async () => {
  const source = await readFile(pythonSourceUrl, 'utf8');
  assert.match(source, /and protocol == "https"/);
  assert.match(source, /and media_scheme == "https"/);
  assert.match(source, /f"\{selected_format_id\}\[protocol=https\]"/);
});

test('downloaded and reused M4A files pass size integrity checks', async () => {
  const source = await readFile(pythonSourceUrl, 'utf8');
  assert.match(source, /def _file_size_is_plausible\(/);
  assert.match(source, /Existing M4A failed size validation/);
  assert.match(source, /"INVALID_MEDIA_FILE"/);
  assert.match(source, /Removed unverified final M4A after download failure/);
});
