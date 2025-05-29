export enum KeyStatus {
    EMPTY,
    PENDING,
    EXISTS
}

export enum ExpiryType {
    SLIDING,
    ABSOLUTE
}

export interface Expiry {
    type: ExpiryType
    timeMs: number
}

export interface L1CacheOptions {
    enabled: boolean
    purgeIntervalSeconds?: number
}

export interface CacheOptions {
    name: string
    expiry?: Expiry
    l1CacheOptions?: L1CacheOptions
}

export interface DistributedDictionary<K, V> {
    asyncBuildOrRetrieve(
        key: K, 
        buildFunc: () => Promise<V>, 
        timeoutMs: number, 
        callback: (value: V) => Promise<void>, 
        error: (err: any) => Promise<void>
    ): void
    buildOrRetrieve(
        key: K, 
        buildFunc: () => Promise<V>, 
        timeoutMs: number
    ): Promise<V>
    status(key: K): Promise<KeyStatus>
    get(key: K, timeoutMs?: number): Promise<V>
    delete(key: K): Promise<void>
    close(): Promise<void>
}
