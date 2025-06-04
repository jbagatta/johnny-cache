import { L1CacheManager } from "./l1-cache-manager"
import { NatsConnection, Subscription } from "nats"
import NodeCache from "node-cache"

const keyDeletedChannel = (namespace: string) => `johnny-cache-keydel.${namespace}.*`
const keyDeletedSubject = (namespace: string, key: string) => `johnny-cache-keydel.${namespace}.${key}`

export class NatsL1CacheManager implements L1CacheManager {
    private readonly subscription: Subscription

    constructor(
        private readonly natsClient: NatsConnection, 
        private readonly namespace: string, 
        private readonly l1Cache: NodeCache
    ) { 
        this.subscription = this.natsClient.subscribe(keyDeletedChannel(this.namespace), {callback: (err, msg) => {
            const key = msg.subject.split('.')[2]
            this.l1Cache.del(key)
        }})
    }

    public get<T>(key: string): T | null {
        return this.l1Cache.get<T>(key) ?? null
    }

    public set<T>(key: string, value: T, ttl?: number): boolean {
        return ttl 
        ? this.l1Cache.set(key, value, ttl * 0.001) 
        : this.l1Cache.set(key, value)
    }

    public async delete(key: string): Promise<void> {
        this.l1Cache.del(key)
        this.natsClient.publish(keyDeletedSubject(this.namespace, key), Buffer.from([]))
    }

    public ttl(key: string, ttlMs: number) {
        this.l1Cache.ttl(key, ttlMs * 0.001)
    }

    public close(): void {
        this.subscription.unsubscribe()
    }
}
