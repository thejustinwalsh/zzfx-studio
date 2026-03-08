declare global {
  interface Window {
    NL_APPID?: string;
    Neutralino?: {
      os: {
        showSaveDialog: (title: string, options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string>;
        showOpenDialog: (title: string, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>;
      };
      filesystem: {
        writeFile: (path: string, data: string) => Promise<void>;
        writeBinaryFile: (path: string, data: ArrayBuffer) => Promise<void>;
        readFile: (path: string) => Promise<string>;
      };
    };
  }
}

export function isNeu() {
  return typeof window !== 'undefined' && typeof window.Neutralino !== 'undefined';
}
