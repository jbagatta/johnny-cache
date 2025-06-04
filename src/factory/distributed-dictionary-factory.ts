
import NodeCache from "node-cache";
import { CacheOptions, DistributedDictionary } from "../core/types";
import { JohnnyCache } from "../core/johnny-cache";
import { NatsConnection } from "nats";
import Redis from "ioredis";
import { JetstreamDistributedLock, LockConfiguration, RedisDistributedLock } from "johnny-locke";
import { RedisL1CacheManager } from "../core/l1-cache/redis-l1-cache-manager";
import { NatsL1CacheManager } from "../core/l1-cache/nats-l1-cache-manager";
import { L1CacheManager } from "../core/l1-cache/l1-cache-manager";

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
            
        let cacheManager: L1CacheManager | undefined
        if (cacheOptions.l1CacheOptions?.enabled === true) {
            const l1 = l1Cache ?? new NodeCache({ 
                checkperiod: cacheOptions.l1CacheOptions?.purgeIntervalSeconds ?? 10,
                errorOnMissing: false,
                deleteOnExpire: true
            })

            cacheManager = (client instanceof Redis)
                ? new RedisL1CacheManager(client, config.namespace, l1)
                : new NatsL1CacheManager(client, config.namespace, l1)
        }
        
        return new JohnnyCache<K, V>(lock, cacheOptions, cacheManager)
    }
}
