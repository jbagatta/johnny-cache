import NodeCache from "node-cache"
import { CacheOptions, DistributedDictionary, ExpiryType, KeyStatus } from "./types"
import { IDistributedLock } from "johnny-locke"

export class JohnnyCache<K, V> implements DistributedDictionary<K, V> {
    private l1CacheEnabled = false

    constructor(
        private readonly lock: IDistributedLock,
        private readonly cacheOptions: CacheOptions,
        private readonly l1Cache: NodeCache 
            = new NodeCache({ 
                checkperiod: cacheOptions.l1CacheOptions?.purgeIntervalSeconds,
                errorOnMissing: false,
                deleteOnExpire: true
            })
    ) { 
        //if (cacheOptions.l1CacheOptions?.enabled ?? false) {
        //    this.messageBroker.onKeyDeleted(this.cacheOptions.name, (key: string) => {
        //        const handleDelete = () => this.l1Cache.del(key)
        //        handleDelete.bind(this)
        //        handleDelete()
        //    })
        //    .then(() => {
        //        this.l1CacheEnabled = true
        //        console.info("L1 cache enabled")})
        //    .catch((err) => {
        //        this.l1CacheEnabled = false
        //        console.warn(`An error occurred, disabling L1 cache: ${err}`)
        //    })
        //}
    }

    private keyString = (key: K) => `${key}`

    public asyncBuildOrRetrieve(
        key: K, 
        buildFunc: () => Promise<V>, 
        timeoutMs: number, 
        callback: (value: V) => Promise<void>, 
        error: (err: any) => Promise<void>
    ): void {
        this.buildOrRetrieve(key, buildFunc, timeoutMs)
            .then(async (result: V) => {
                await callback(result)
            })
            .catch(async (err) => {
                await error(err)
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
        if (!entry.value) {
            return KeyStatus.EMPTY
        }

        this.insertIntoL1Cache(keyString, entry.value.value as any)
        return KeyStatus.EXISTS
    }

    public async delete(key: K): Promise<void> {
        const keyString = this.keyString(key)

        this.l1Cache.del(keyString)
        await this.lock.delete(keyString)
    }

    public async close(): Promise<void> {
        this.lock.close()
    }

    private insertIntoL1Cache(key: string, value: V): void {
        if (this.l1CacheEnabled) {
            if (this.cacheOptions.expiry) {
                this.l1Cache.set(key, value, this.cacheOptions.expiry.timeMs * 0.001)
            }
            else {
                this.l1Cache.set(key, value)
            }
        }
    }

    private tryGetFromL1Cache(namespacedKey: string): V | null {
        const localValue = this.l1Cache.get<V>(namespacedKey)
        if (!localValue) { return null }

        this.updateExpiry(namespacedKey)

        return localValue
    }

    private updateExpiry(namespacedKey: string) {
        if (this.cacheOptions.expiry?.type === ExpiryType.SLIDING) {
            this.l1Cache.ttl(namespacedKey, this.cacheOptions.expiry.timeMs * 0.001)

            this.lock.resetExpiry(namespacedKey)
                .then(() => {})
                .catch((err) => {
                    console.error(`Could not update expiry for key ${namespacedKey} due to: ${err}`)
                })
        }
    }
}
