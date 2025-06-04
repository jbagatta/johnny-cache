export interface L1CacheManager {
    get<T>(namespacedKey: string): T | null 
    set<T>(key: string, value: T, ttlMs?: number | string): boolean
    delete(key: string): Promise<void> 
    ttl(key: string, ttlMs: number): void
    close(): void 
}