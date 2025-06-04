import { Redis } from "ioredis"
import { L1CacheManager } from "./l1-cache-manager"
import NodeCache from "node-cache"

const keyDeletedChannel = (namespace: string) => `johnny-cache-keydel:${namespace}`

export class RedisL1CacheManager implements L1CacheManager {
    private readonly subscriber: Redis

    constructor(
        private readonly redis: Redis, 
        private readonly namespace: string, 
        private readonly l1Cache: NodeCache
    ) { 
        this.subscriber = this.redis.duplicate()        
        
        this.subscriber.subscribe(keyDeletedChannel(this.namespace))
        this.subscriber.on('message', (channel, message) => {
            try {
                const key = message as string
                l1Cache.del(key)
            } catch (error) {
                console.error(error)
            }
        })
    }

    public get<T>(key: string): T | null {
        return this.l1Cache.get<T>(key) ?? null
    }

    public set<T>(key: string, value: T, ttl?: number | string): boolean {
        return ttl ? this.l1Cache.set(key, value, ttl) : this.l1Cache.set(key, value)
    }

    public async delete(key: string): Promise<void> {
        this.l1Cache.del(key)
        await this.redis.publish(keyDeletedChannel(this.namespace), key)
    }

    public ttl(key: string, ttlMs: number) {
        this.l1Cache.ttl(key, ttlMs * 0.001)
    }

    public close(): void {
        this.subscriber.unsubscribe(keyDeletedChannel(this.namespace))
        this.subscriber.quit().catch(console.error)
    }
}
