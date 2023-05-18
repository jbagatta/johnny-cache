
import NodeCache from "node-cache";
import { CacheOptions, DistributedDictionary } from "../core/types";
import { JohnnyCache } from "../core/johnny-cache";
import { DataStore } from "../ports/data-store";
import { MessageBroker } from "../ports/message-broker";
import { NatsConnectionOptions, createJetstreamMessageBroker } from "../adapters/message-brokers/jetstream-message-broker";
import { RedisConnectionOptions, createRedisDataStore } from "../adapters/data-stores/redis-data-store";
import { createRedisMessageBroker } from "../adapters/message-brokers/redis-message-broker";

export class DistributedDictionaryFactory {
    public static async createCustom<K, V>(
        dataStore: DataStore,
        messageBroker: MessageBroker,
        cacheOptions: CacheOptions,
        l1Cache?: NodeCache
    ): Promise<DistributedDictionary<K, V>> {
        return new JohnnyCache<K, V>(dataStore, messageBroker, cacheOptions, l1Cache)
    }

    public static async create<K, V>(
        dataStoreConnectionOptions: RedisConnectionOptions,
        messageBrokerConnectionOptions: NatsConnectionOptions | RedisConnectionOptions, 
        cacheOptions: CacheOptions,
        l1Cache?: NodeCache
    ): Promise<DistributedDictionary<K, V>> {
        let messageBroker: MessageBroker
        if (messageBrokerConnectionOptions instanceof NatsConnectionOptions) {
            messageBroker = await createJetstreamMessageBroker(messageBrokerConnectionOptions)
        }
        else {
            messageBroker = createRedisMessageBroker(messageBrokerConnectionOptions)
        }
        
        const dataStore = createRedisDataStore(dataStoreConnectionOptions)

        return await this.createCustom<K, V>(dataStore, messageBroker, cacheOptions, l1Cache)
    }
}

export {RedisConnectionOptions, NatsConnectionOptions}