/**
 * Service Container - VS Code-inspired dependency injection
 *
 * Pattern: Services register themselves and can be retrieved by other modules.
 * Each service has init() for setup and dispose() for cleanup.
 */

import type { BrowserWindow } from 'electron';

export interface IService {
  readonly serviceName: string;
  init?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

export interface ServiceContext {
  mainWindow: BrowserWindow | null;
  workspacesDir: string;
  currentWorkspacePath: string | null;
  setCurrentWorkspacePath: (path: string | null) => void;
}

class ServiceContainer {
  private services = new Map<string, IService>();
  private context: ServiceContext | null = null;

  setContext(ctx: ServiceContext): void {
    this.context = ctx;
  }

  getContext(): ServiceContext {
    if (!this.context) {
      throw new Error('ServiceContainer context not initialized');
    }
    return this.context;
  }

  register<T extends IService>(service: T): T {
    this.services.set(service.serviceName, service);
    return service;
  }

  get<T extends IService>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  async initAll(): Promise<void> {
    for (const service of this.services.values()) {
      if (service.init) {
        await service.init();
      }
    }
  }

  async disposeAll(): Promise<void> {
    for (const service of this.services.values()) {
      if (service.dispose) {
        await service.dispose();
      }
    }
    this.services.clear();
  }
}

// Singleton instance
export const services = new ServiceContainer();
