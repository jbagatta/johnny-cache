import { DistributedDictionary, ExpiryType } from '../../src/core/types'
import { CacheOptions } from '../../src/core/types'
import { NatsConnectionOptions, RedisConnectionOptions } from '../../src/factory/types'
import { DistributedCacheFactory } from '../../src/factory/distributed-dictionary-factory'
import { v4 } from 'uuid'

describe("Distributed Dictionary", () => {
    const parallelism = 100
    let caches: Array<DistributedDictionary<string, string>>

    beforeEach(async () => {
        caches = new Array<DistributedDictionary<string, string>> (parallelism)
        for (let i = 0; i < parallelism; i++) {
            caches[i] = await newCache<string, string>()
         }
    })

    afterEach(async () => {
        for (const cache of caches) {
            await cache.close()
        }
    })
    
    test("should only build once with concurrent requests to single instance", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return value
        })

        const builds = caches.map(async () => caches[0].buildOrRetrieve(key, buildFunc, 2000))
        const results = await Promise.all(builds)

        expect(buildFunc).toHaveBeenCalledTimes(1)
        results.forEach((r) => expect(r).toBe(value))
    })
    
    test("should only build once with concurrent distributed requests", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return value
        })

        const builds = caches.map(async (c) => c.buildOrRetrieve(key, buildFunc, 2000))

        await sleep(750)

        const edgeCaseBuilds = caches.map(async (c) =>  {
            await sleep(5)
            return c.buildOrRetrieve(key, buildFunc, 2000)
        })

        const results1 = await Promise.all(builds)
        const results2 = await Promise.all(edgeCaseBuilds)

        expect(buildFunc).toHaveBeenCalledTimes(1)
        results1.forEach((r) => expect(r).toBe(value))
        results2.forEach((r) => expect(r).toBe(value))
    })
    
    test("should retrieve existing once built", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return value
        })

        const firstResult = await caches[0].buildOrRetrieve(key, buildFunc, 2000)
        expect(buildFunc).toHaveBeenCalledTimes(1)
        expect(firstResult).toBe(value)

        const buildFunc2 = jest.fn().mockImplementation(async () => {
            return "wrong value"
        })
        const builds = caches.map(async (c) => c.buildOrRetrieve(key, buildFunc2, 2000))
        const results = await Promise.all(builds)

        expect(buildFunc2).not.toHaveBeenCalled()
        results.forEach((r) => expect(r).toBe(firstResult))
    })

    test("should propagate error to all clients waiting for build ID", async () => {
        const key = v4()
        const err = new Error("this is an error")
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            throw err
        })

        const builds = caches.map(async () => caches[0].buildOrRetrieve(key, buildFunc, 2000))
        const results = await Promise.allSettled(builds)

        expect(buildFunc).toHaveBeenCalledTimes(1)
        results.forEach((r) => expect(r.status).toBe("rejected"))
        results.forEach((r) => expect((r as PromiseRejectedResult).reason.message).toBe(err.message))
    })

    // propagate errors
    // no timeouts around error
    // build new after timeout
    // invalid build does not cache (first build long timeout in func, key expires, new build, first build completes)
})

async function newCache<K, V>() {
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
          timeMs: 60*1000
        },
        l1CacheOptions: {
          enabled: true,
          purgeIntervalMs: 10*60*1000
        }
    }
    return await DistributedCacheFactory.create<K, V>(natsConnectOptions, redisConnectionOptions, options)
}

async function sleep(ms: number) {
    return new Promise((res) => {
        setTimeout(res, ms)
    })
}