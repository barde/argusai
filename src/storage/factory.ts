import { Env } from '../types/env';
import { IStorageService, IStorageServiceFactory } from './interface';
import { StorageService } from './service';

export class StorageServiceFactory implements IStorageServiceFactory {
  private static instance: StorageService | null = null;

  create(env: Env): IStorageService {
    // For Workers, we create a new instance per request
    // This ensures proper isolation between requests
    return new StorageService(env);
  }

  // Static method for singleton pattern if needed in tests
  static getInstance(env: Env): IStorageService {
    if (!this.instance) {
      this.instance = new StorageService(env);
    }
    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }
}
