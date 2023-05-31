import NodeCache from 'node-cache'
import { ExpiryType } from '../../src/core/types'
import { CacheOptions } from '../../src/core/types'
import { RedisConnectionOptions } from '../../src/adapters/data-stores/redis-data-store'
import { NatsConnectionOptions } from '../../src/adapters/message-brokers/jetstream-message-broker'
import { DistributedDictionaryFactory } from '../../src/factory/distributed-dictionary-factory'

export async function createTestCache<K, V>(l1Cache?: NodeCache, expirySeconds = 60) {
    const natsConnectOptions: NatsConnectionOptions = {
        urls: ["nats://localhost:4222"],
        token: "l0c4lt0k3n",
        stream: "jc"
    }
    const redisConnectionOptions: RedisConnectionOptions = {
        sentinel: {
            host: "localhost",
            port: 26379,
            primaryName: "mymaster",
        },
        password: "l0c4lt0k3n"
    }

    const options: CacheOptions = {
        name: "test-cache",
        expiry: {
          type: ExpiryType.SLIDING,
          timeMs: expirySeconds * 1000
        },
        l1CacheOptions: {
          enabled: l1Cache ? true : false,
          purgeIntervalSeconds: l1Cache ? 10 * expirySeconds : undefined
        }
    }

    return await DistributedDictionaryFactory
        .create<K, V>(redisConnectionOptions, redisConnectionOptions, options, l1Cache)
}

export async function sleep(ms: number) {
    return new Promise((res) => {
        setTimeout(res, ms)
    })
}

export function iterator(num: number) {
    return Array.from(Array(num).keys())
}