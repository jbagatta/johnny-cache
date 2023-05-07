import { Expiry, ExpiryType } from "./types"

interface CacheEntry<V> {
    value: V
    expiry: Expiry | undefined,
    lastAccessed: number
}

// TODO: configurable expiry removal: immediate, interval, on-access
export class L1Cache<V> {
    constructor(private readonly cache: Map<string, CacheEntry<V>> = new Map<string, CacheEntry<V>>()) { }

    public set(key: string, value: V, expiry?: Expiry) {
        this.cache.set(key, {
            value: value,
            expiry: expiry,
            lastAccessed: Date.now()
        })
    }

    public get(key: string): V | null {
        const entry = this.cache.get(key)
        if (!entry) {
            return null
        }

        if (entry.expiry !== undefined) {
            if (entry.lastAccessed + entry.expiry.timeMs <= Date.now()) {
                this.delete(key)
                return null
            }
            if (entry.expiry.type === ExpiryType.SLIDING) {
                this.set(key, entry.value, entry.expiry)
            }
        }

        return entry.value
    }

    public delete(key: string) {
        this.cache.delete(key)
    }

    public setPurgeInterval(purgeIntervalMs: number) {
        const timeout: NodeJS.Timeout = setTimeout(this.purgeExpired, purgeIntervalMs)
        timeout.unref()
    }

    private purgeExpired() {
        const time = Date.now()
        for (const [key, entry] of this.cache) {
            if (entry.expiry) {
                if (entry.lastAccessed + entry.expiry.timeMs <= time) {
                    this.cache.delete(key)
                }
            }
        }
    }
}