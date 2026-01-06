// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-example'
  | 'claude-code:query'
  | 'claude-code:response'
  | 'claude-code:error'
  | 'claude-code:output-files'
  | 'auth:set-token'
  | 'auth:get-token'
  | 'auth:clear-token'
  | 'auth:oauth-popup'
  | 'library:fetch'
  | 'library:result'
  | 'workspace:bootstrap'
  | 'workspace:ready'
  | 'workspace:error'
  | 'workspace:get-current'
  | 'settings:set-api-key'
  | 'settings:get-api-key'
  | 'settings:clear-api-key'
  | 'claude:check-status';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    invoke(channel: string, ...args: unknown[]) {
      return ipcRenderer.invoke(channel, ...args);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
