import { ExpiryType } from '../../src/core/types'
import { CacheOptions } from '../../src/core/types'
import { NatsConnectionOptions, RedisConnectionOptions } from '../../src/factory/types'
import { DistributedDictionaryFactory } from '../../src/factory/distributed-dictionary-factory'

export async function createTestCache<K, V>(l1Enabled = false, expirySeconds = 60) {
    const natsConnectOptions: NatsConnectionOptions = {
        urls: ["nats://localhost:4222"],
        token: "l0c4lt0k3n"
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
          enabled: l1Enabled,
          purgeIntervalSeconds: l1Enabled ? 10 * expirySeconds : undefined
        }
    }

    return await DistributedDictionaryFactory.create<K, V>(natsConnectOptions, redisConnectionOptions, options)
}

export async function sleep(ms: number) {
    return new Promise((res) => {
        setTimeout(res, ms)
    })
}

export function iterator(num: number) {
    return Array.from(Array(num).keys())
}