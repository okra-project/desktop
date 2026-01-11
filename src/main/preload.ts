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
  | 'workspace:list-files'
  | 'claude:check-status'
  // Verification system channels
  | 'verification:start-session'
  | 'verification:pause-session'
  | 'verification:resume-session'
  | 'verification:end-session'
  | 'verification:get-session'
  | 'verification:list-sessions'
  | 'verification:permission-request'
  | 'verification:permission-response'
  | 'verification:event'
  | 'verification:ghost-show'
  | 'verification:ghost-hide'
  | 'verification:navigate'
  | 'verification:page-status'
  | 'verification:edit-extraction'
  | 'verification:add-annotation'
  | 'verification:agent-thinking'
  | 'verification:rrweb-event'
  | 'verification:state-changed'
  | 'verification:get-events'
  | 'verification:get-events-since'
  | 'verification:execute-action'
  // Review agent channels
  | 'review-agent:query'
  | 'review-agent:response'
  | 'review-agent:error'
  | 'review-agent:done'
  | 'review-agent:abort'
  // Telemetry channels (PostHog)
  | 'telemetry:event'
  | 'telemetry:get-consent'
  | 'telemetry:set-consent'
  | 'telemetry:get-user-id'
  // Menu channels
  | 'menu:open-pdf'
  | 'menu:open-settings'
  // Extraction channels
  | 'extraction:progress'
  | 'extraction:table-progress'
  // OCR Provider channels
  | 'ocr:progress'
  | 'ocr:list-providers'
  | 'ocr:get-provider'
  | 'ocr:save-config'
  | 'ocr:get-config'
  | 'ocr:check-health'
  | 'ocr:extract-page'
  | 'ocr:extract-document'
  | 'ocr:compare'
  | 'ocr:get-results'
  | 'ocr:get-page-bboxes';

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
