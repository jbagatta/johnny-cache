import { DistributedDictionary, ExpiryType } from '../../src/core/types'
import { CacheOptions } from '../../src/core/types'
import { NatsConnectionOptions, RedisConnectionOptions } from '../../src/factory/types'
import { DistributedCacheFactory } from '../../src/factory/distributed-dictionary-factory'
import { v4 } from 'uuid'

describe("Distributed Dictionary", () => {
    const parallelism = 100
    let caches: Array<DistributedDictionary<string, string>> = new Array<DistributedDictionary<string, string>> (parallelism)

    beforeEach(async () => {
        for (let i = 0; i < parallelism; i++) {
            caches[i] = await newCache()
         }
    })

    afterEach(async () => {
        for (const cache of caches) {
            await cache.close()
        }
    })
    
    test("it should only build once", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(2000)
            return value
        })

        const builds = caches.map(async (c) => c.buildOrRetrieve(key, buildFunc, 5_000))
        const results = await Promise.all(builds)

        expect(buildFunc).toHaveBeenCalledTimes(1)
        results.forEach((r) => expect(r).toBe(value))
    }, 10_000)
})

async function newCache() {
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
          timeMs: 60* 1000
        },
        l1CacheOptions: {
          enabled: true,
          purgeIntervalMs: 10*60*1000
        }
    }
    return await DistributedCacheFactory.create<string, string>(natsConnectOptions, redisConnectionOptions, options)
}

async function sleep(ms: number) {
    return new Promise((res) => {
        setTimeout(res, ms)
    })
}