import { DiscardPolicy, RetentionPolicy, StorageType, connect, nanos } from "nats";
import { CacheOptions, DistributedDictionary } from "../core/types";
import { Redis } from "ioredis";
import { JetstreamMessageBroker } from "../adapters/jetstream-message-broker";
import { RedisDataStore } from "../adapters/redis-data-store";
import { JohnnyCache } from "../core/johnny-cache";
import { NatsConnectionOptions, RedisConnectionOptions } from "./types";
import NodeCache from "node-cache";
import { DataStore } from "../ports/data-store";
import { MessageBroker } from "../ports/message-broker";

export class DistributedDictionaryFactory {
    public static async createCustom<K, V>(
        dataStore: DataStore,
        messageBroker: MessageBroker,
        cacheOptions: CacheOptions,
        l1Cache?: NodeCache
    ): Promise<DistributedDictionary<K, V>> {
        return new JohnnyCache<K, V>(dataStore, messageBroker, cacheOptions, l1Cache)
    }

    public static async createDistributed<K, V>(
        redisConnectionOptions: RedisConnectionOptions,  // use | for different stores
        natsConnectionOptions: NatsConnectionOptions,    // use | for different brokers
        cacheOptions: CacheOptions,
        l1Cache?: NodeCache
    ): Promise<DistributedDictionary<K, V>> {
        const messageBroker = await this.createJetstreamMessageBroker(natsConnectionOptions)
        const dataStore = this.createRedisDataStore(redisConnectionOptions)

        return this.createCustom<K, V>(dataStore, messageBroker, cacheOptions, l1Cache)
    }

    private static async createJetstreamMessageBroker(natsConnectionOptions: NatsConnectionOptions): Promise<JetstreamMessageBroker> {
        const natsClient = await connect({
            servers: natsConnectionOptions.urls,
            token: natsConnectionOptions.token
        })

        const jsm = await natsClient.jetstreamManager()
        await jsm.streams.add({
            name: "jc",
            retention: RetentionPolicy.Limits,
            storage: StorageType.Memory,
            discard: DiscardPolicy.Old,
            max_age: nanos(30*1000),
            subjects: ["jc.builds.*", "jc.events.*"]
        })
        
        return new JetstreamMessageBroker(natsClient, "jc")
    }

    private static createRedisDataStore(redisConnectionOptions: RedisConnectionOptions): RedisDataStore {
        let redisClient: Redis
        if (redisConnectionOptions.sentinel) {
            redisClient = new Redis({
                sentinels: [ { host: redisConnectionOptions.sentinel.url, port: redisConnectionOptions.sentinel.port } ],
                name: redisConnectionOptions.sentinel.primaryName,
                password: redisConnectionOptions.password,
                sentinelPassword: redisConnectionOptions.password
            })
        }
        else {
            redisClient = new Redis({
                path: redisConnectionOptions.url,
                password: redisConnectionOptions.password
            })
        } 
        
        return new RedisDataStore(redisClient)
    }
}