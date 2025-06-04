
import NodeCache from "node-cache";
import { CacheOptions, DistributedDictionary } from "../core/types";
import { JohnnyCache } from "../core/johnny-cache";
import { NatsConnection } from "nats";
import Redis from "ioredis";
import { JetstreamDistributedLock, LockConfiguration, RedisDistributedLock } from "johnny-locke";

export class DistributedDictionaryFactory {
    public static async create<K, V>(
        client: NatsConnection | Redis,
        cacheOptions: CacheOptions,
        l1Cache?: NodeCache
    ): Promise<DistributedDictionary<K, V>> {
        const config: LockConfiguration = {
            namespace: cacheOptions.name,
            defaultLockDurationMs: cacheOptions.expiry?.timeMs ?? 30_000,
            objectExpiryMs: cacheOptions.expiry?.timeMs
        }

        const lock = (client instanceof Redis)
            ? await RedisDistributedLock.create(client, config)
            : await JetstreamDistributedLock.create(client, config)
        
        return new JohnnyCache<K, V>(lock, cacheOptions, l1Cache)
    }
}
