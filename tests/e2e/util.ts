import { ExpiryType } from '../../src/core/types'
import { CacheOptions } from '../../src/core/types'
import { NatsConnectionOptions, RedisConnectionOptions } from '../../src/factory/types'
import { DistributedDictionaryFactory } from '../../src/factory/distributed-dictionary-factory'
import NodeCache from 'node-cache'

export async function createTestCache<K, V>(expirySeconds = 60, l1Cache?: NodeCache) {
    const natsConnectOptions: NatsConnectionOptions = {
        urls: ["nats://localhost:4222"],
        token: "l0c4lt0k3n",
        stream: "jc"
    }
    const redisConnectionOptions: RedisConnectionOptions = {
        sentinel: {
            url: "localhost",
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

    return await DistributedDictionaryFactory.createDistributed<K, V>(redisConnectionOptions, natsConnectOptions, options, l1Cache)
}

export async function sleep(ms: number) {
    return new Promise((res) => {
        setTimeout(res, ms)
    })
}

export function iterator(num: number) {
    return Array.from(Array(num).keys())
}