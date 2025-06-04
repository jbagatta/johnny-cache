import { CacheOptions, DistributedDictionary, ExpiryType, KeyStatus } from "./types"
import { L1CacheManager } from "./l1-cache/l1-cache-manager"
import { IDistributedLock } from "@jbagatta/johnny-locke"

export class JohnnyCache<K, V> implements DistributedDictionary<K, V> {
    constructor(
        private readonly lock: IDistributedLock,
        private readonly cacheOptions: CacheOptions,
        private readonly l1Cache?: L1CacheManager 
    ) { }

    private keyString = (key: K) => `${key}`

    public asyncBuildOrRetrieve(
        key: K, 
        buildFunc: () => Promise<V>, 
        callback: (value?: V, err?: any) => Promise<void>, 
        timeoutMs: number
    ): void {
        this.buildOrRetrieve(key, buildFunc, timeoutMs)
            .then(async (result: V) => {
                await callback(result)
            })
            .catch(async (err) => {
                await callback(undefined, err)
            })
    }

    public async buildOrRetrieve(
        key: K, 
        buildFunc: () => Promise<V>, 
        timeoutMs: number
    ): Promise<V> {
        const keyString = this.keyString(key)

        const localValue = this.tryGetFromL1Cache(keyString)
        if (localValue) { return localValue }

        let existing = await this.lock.wait<V>(keyString, timeoutMs)
        if (existing.value === null) {
            existing = await this.lock.withLock<V>(
                keyString, 
                timeoutMs, 
                async (existingValue: V | null) => {
                    if (existingValue !== null) {
                        return existingValue
                    }
            
                    return await buildFunc()
                },
                timeoutMs)
        }

        this.insertIntoL1Cache(keyString, existing.value!)

        return existing.value!
    }

    public async get(key: K, timeoutMs: number): Promise<V> {
        const keyString = this.keyString(key)

        const localValue = this.tryGetFromL1Cache(keyString)
        if (localValue) { return localValue }

        const obj = await this.lock.wait<V>(keyString, timeoutMs)
        if (obj.value === null) {
            throw new Error(`Key ${key} does not exist in cache ${this.cacheOptions.name}`)
        }

        this.updateExpiry(keyString)
        this.insertIntoL1Cache(keyString, obj.value!)

        return obj.value!
    }    
    
    public async status(key: K): Promise<KeyStatus> {
        const keyString = this.keyString(key)

        const localValue = this.tryGetFromL1Cache(keyString)
        if (localValue) { return KeyStatus.EXISTS }

        const entry = await this.lock.tryAcquireLock(keyString)
        if (!entry.acquired) {
            return KeyStatus.PENDING
        }

        await this.lock.releaseLock(keyString, entry.value!)
        if (entry.value!.value === null) {
            return KeyStatus.EMPTY
        }

        this.insertIntoL1Cache(keyString, entry.value!.value as any)
        return KeyStatus.EXISTS
    }

    public async delete(key: K): Promise<void> {
        const keyString = this.keyString(key)

        this.l1Cache?.delete(keyString)
        await this.lock.delete(keyString)
    }

    public async close(): Promise<void> {
        this.l1Cache?.close()
        this.lock.close()
    }

    private insertIntoL1Cache(key: string, value: V): void {
        if (this.l1Cache) {
            if (this.cacheOptions.expiry) {
                this.l1Cache.set(key, value, this.cacheOptions.expiry.timeMs * 0.001)
            }
            else {
                this.l1Cache.set(key, value)
            }
        }
    }

    private tryGetFromL1Cache(key: string): V | null {
        const localValue = this.l1Cache?.get<V>(key)
        if (!localValue) { return null }

        this.updateExpiry(key)

        return localValue
    }

    private updateExpiry(key: string) {
        if (this.cacheOptions.expiry?.type === ExpiryType.SLIDING) {
            const time = this.cacheOptions.expiry.timeMs
            this.l1Cache?.ttl(key, time)

            const update = async () => {
                const lock = await this.lock.tryAcquireLock(key)
                if (lock.acquired) await this.lock.releaseLock(key, lock.value!)
            }
            update()
                .then(() => {})
                .catch((err) => {
                    console.error(`Could not update expiry for key ${key} due to: ${err}`)
                })
        }
    }
}
