// Platform-aware file I/O — uses Neutralino native dialogs when available,
// falls back to browser DOM tricks (blob URLs, hidden inputs).

import { isNeu } from './is-neu';

export async function saveTextFile(content: string, filename: string, filters?: Array<{ name: string; extensions: string[] }>) {
  console.log('[file-io] saveTextFile called, isNeu:', isNeu(), 'Neutralino:', typeof window.Neutralino);
  try {
    if (isNeu()) {
      const path = await window.Neutralino!.os.showSaveDialog('Save', { defaultPath: filename, filters });
      console.log('[file-io] save dialog returned path:', path);
      if (path) await window.Neutralino!.filesystem.writeFile(path, content);
    } else {
      const blob = new Blob([content], { type: 'text/plain' });
      downloadBlob(blob, filename);
    }
  } catch (e) {
    console.error('[file-io] saveTextFile error:', e);
  }
}

export async function saveBinaryFile(data: ArrayBuffer | Blob, filename: string, filters?: Array<{ name: string; extensions: string[] }>) {
  console.log('[file-io] saveBinaryFile called, isNeu:', isNeu());
  try {
    if (isNeu()) {
      const path = await window.Neutralino!.os.showSaveDialog('Save', { defaultPath: filename, filters });
      console.log('[file-io] save dialog returned path:', path);
      if (path) {
        const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
        await window.Neutralino!.filesystem.writeBinaryFile(path, buffer);
      }
    } else {
      const blob = data instanceof Blob ? data : new Blob([data]);
      downloadBlob(blob, filename);
    }
  } catch (e) {
    console.error('[file-io] saveBinaryFile error:', e);
  }
}

export async function openTextFile(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> {
  console.log('[file-io] openTextFile called, isNeu:', isNeu());
  try {
    if (isNeu()) {
      const entries = await window.Neutralino!.os.showOpenDialog('Open', { filters });
      console.log('[file-io] open dialog returned entries:', entries);
      if (entries?.[0]) return window.Neutralino!.filesystem.readFile(entries[0]);
      return null;
    } else {
      return browserOpenFile(filters?.flatMap(f => f.extensions.map(e => `.${e}`)).join(','));
    }
  } catch (e) {
    console.error('[file-io] openTextFile error:', e);
    return null;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function browserOpenFile(accept?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve(await file.text());
    };
    // Handle cancel (input never fires change)
    window.addEventListener('focus', function onFocus() {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => { if (!input.files?.length) resolve(null); }, 300);
    });
    input.click();
  });
}
