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

        const edgeCaseBuilds = new Array<Promise<string>>(200)
        for (let i=0; i<200; i++) {
            await sleep(1)
            edgeCaseBuilds[i] = cache.buildOrRetrieve(key, buildFunc, 200)
        }

        const results = await Promise.all(builds)
        const edgeCaseResults = await Promise.all(edgeCaseBuilds)

        expect(buildFunc).toHaveBeenCalledTimes(1)
        results.forEach((r) => expect(r).toBe(value))
        edgeCaseResults.forEach((r) => expect(r).toBe(value))
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
        const builds = iterator(100).map(async () => cache.buildOrRetrieve(key, buildFunc2, 1))
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

    test("should allow immediate rebuild after error", async () => {
        const key = v4()

        const builds = iterator(100).map(async (i) => {
            await sleep(i)
            return await cache.buildOrRetrieve(key, () => {
                if (i < 50) {
                    return Promise.reject(new Error('failure'))
                }
                else {
                    return Promise.resolve('success')
                }
            }, 2000)
        })
        const results = await Promise.allSettled(builds)

        const fails = results.filter(({status}) => status === 'rejected')
        expect(fails.length).toBeGreaterThan(1)
        fails.forEach((r) => expect((r as PromiseRejectedResult).reason.message).toBe("failure"))

        const successes = results.filter(({status}) => status === 'fulfilled')
        expect(successes.length).toBeGreaterThan(1)
        successes.forEach((r) => expect((r as PromiseFulfilledResult<string>).value).toBe("success"))
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

describe("Distributed Dictionary: asyncBuildOrRetrieve()", () => {
    let cache: DistributedDictionary<string, string>

    beforeEach(async () => {
        cache = await newCache<string, string>()
    })

    afterEach(async () => {
        await cache?.close()
    })

    test("should call callback with result on success", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            return value
        })
        const success = jest.fn()
        const failure = jest.fn()

        cache.asyncBuildOrRetrieve(key, buildFunc, 1000, success, failure)

        await sleep(100)

        expect(success).toHaveBeenCalled()
    })

    test("should call error on error", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            throw new Error()
        })
        const success = jest.fn()
        const failure = jest.fn()

        cache.asyncBuildOrRetrieve(key, buildFunc, 1000, success, failure)

        await sleep(100)

        expect(failure).toHaveBeenCalled()
    })
})

describe("Distributed Dictionary: get()", () => {
    let cache: DistributedDictionary<string, string>

    beforeEach(async () => {
        cache = await newCache<string, string>()
    })

    afterEach(async () => {
        await cache?.close()
    })

    test("should wait for builds when getting with timeout", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return value
        })

        const call = cache.buildOrRetrieve(key, buildFunc, 2000)

        const gets = iterator(100).map(async () => cache.get(key, 2000))
        const results = await Promise.all(gets)

        const result = await call
        results.forEach((r) => expect(r).toBe(result))
    })

    test("should not wait for builds when getting without timeout", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return value
        })

        const call = cache.buildOrRetrieve(key, buildFunc, 2000)

        const gets = iterator(100).map(async () => cache.get(key))
        const results = await Promise.allSettled(gets)

        await call

        results.forEach((r) => expect(r.status).toBe("rejected"))
        results.forEach((r) => expect((r as PromiseRejectedResult).reason.message).toContain('is not complete'))
    })

    test("should error immediately when getting nonexistent key", async () => {
        const key = v4()

        await expect(async () => cache.get(key, 1000)).rejects.toThrow(`Key ${key} does not exist in cache test-cache`)
    })
})

describe("Distributed Dictionary: status()", () => {
    let cache: DistributedDictionary<string, string>

    beforeEach(async () => {
        cache = await newCache<string, string>()
    })

    afterEach(async () => {
        await cache?.close()
    })

    test("should return correct status", async () => {
        const key = v4()
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return "build result"
        })
        expect(await cache.status(key)).toBe(KeyStatus.EMPTY)

        const call = cache.buildOrRetrieve(key, buildFunc, 2000)
        expect(await cache.status(key)).toBe(KeyStatus.PENDING)

        await call
        expect(await cache.status(key)).toBe(KeyStatus.EXISTS)

        await cache.delete(key)
        expect(await cache.status(key)).toBe(KeyStatus.EMPTY)
    })
})

describe("Distributed Dictionary: delete()", () => {
    let cache: DistributedDictionary<string, string>

    beforeEach(async () => {
        cache = await newCache<string, string>()
    })

    afterEach(async () => {
        await cache?.close()
    })

    test("should remove key and allow immediate rebuild after delete", async () => {
        const key = v4()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return value
        })

        await cache.buildOrRetrieve(key, buildFunc, 2000)

        const builds = iterator(100).map(async (i) => {
            if (i === 50) {
                await cache.delete(key)
            }
            return await cache.buildOrRetrieve(key, buildFunc, 2000)
        })
        const results = await Promise.all(builds)

        expect(buildFunc).toHaveBeenCalledTimes(2)
        results.forEach((r) => expect(r).toBe(value))
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