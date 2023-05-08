import { DistributedDictionary, ExpiryType, KeyStatus } from '../../src/core/types'
import { CacheOptions } from '../../src/core/types'
import { NatsConnectionOptions, RedisConnectionOptions } from '../../src/factory/types'
import { DistributedCacheFactory } from '../../src/factory/distributed-dictionary-factory'
import { v4 } from 'uuid'

describe("Distributed Dictionary: buildOrRetrieve()", () => {
    let cache: DistributedDictionary<string, string>

    beforeEach(async () => {
        cache = await newCache<string, string>()
    })

    afterEach(async () => {
        await cache?.close()
    })

    test("should only build once with concurrent distributed requests", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return value
        })

        const builds = iterator(100).map(async () => cache.buildOrRetrieve(key, buildFunc, 2000))

        await sleep(850)

        const edgeCaseBuilds = iterator(200).map(async () =>  {
            await sleep(1)
            return cache.buildOrRetrieve(key, buildFunc, 2000)
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

        const firstResult = await cache.buildOrRetrieve(key, buildFunc, 2000)
        expect(buildFunc).toHaveBeenCalledTimes(1)
        expect(firstResult).toBe(value)

        const buildFunc2 = jest.fn().mockImplementation(async () => {
            return "wrong value"
        })
        const builds = iterator(100).map(async () => cache.buildOrRetrieve(key, buildFunc2, 2000))
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

        const builds = iterator(100).map(async () => cache.buildOrRetrieve(key, buildFunc, 2000))
        const results = await Promise.allSettled(builds)

        expect(buildFunc).toHaveBeenCalledTimes(1)
        results.forEach((r) => expect(r.status).toBe("rejected"))
        results.forEach((r) => expect((r as PromiseRejectedResult).reason.message).toBe(err.message))
    })

    test("should error with timeout when buildFunc runs long", async () => {
        const key = v4()
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(3000)
            return ""
        })

        const firstResult = cache.buildOrRetrieve(key, buildFunc, 3000)

        const builds = iterator(100).map(async () => cache.buildOrRetrieve(key, buildFunc, 10))
        const results = await Promise.allSettled(builds)

        await firstResult

        results.forEach((r) => expect(r.status).toBe("rejected"))
        results.forEach((r) => expect((r as PromiseRejectedResult).reason.message).toContain("is not complete"))
    })

    test("should not cache a build that times out", async () => {
        const key = v4()
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return "build result"
        })

        const invalidBuild = await cache.buildOrRetrieve(key, buildFunc, 100)
        expect(invalidBuild).toBe("build result")
        expect(await cache.status(key)).toBe(KeyStatus.EMPTY)

        const buildFunc2 = jest.fn().mockImplementation(async () => {
            return "new build result"
        })

        const validBuild = await cache.buildOrRetrieve(key, buildFunc2, 100)
        expect(validBuild).toBe("new build result")
        expect(await cache.status(key)).toBe(KeyStatus.EXISTS)
    })
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

function iterator(num: number) {
    return Array.from(Array(num).keys())
}