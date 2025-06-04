import { iterator, sleep } from './util'
import { CacheOptions, DistributedDictionary, ExpiryType, KeyStatus } from '../../src/core/types'
import Redis from 'ioredis'
import { DistributedDictionaryFactory } from '../../src/factory/distributed-dictionary-factory'

describe("Distributed Dictionary: buildOrRetrieve()", () => {
    let cache: DistributedDictionary<string, string>
    let redis: Redis

    beforeEach(async () => {
        const options: CacheOptions = {
            name: "test-cache",
            expiry: {
              type: ExpiryType.SLIDING,
              timeMs: 1000
            }
        }
    
        redis = new Redis('redis://localhost:6379')
        cache = await DistributedDictionaryFactory.create<string, string>(redis, options)
    })

    afterEach(async () => {
        await cache?.close()
        await redis.quit()
    })

    test("should only build once with concurrent distributed requests", async () => {
        const key = crypto.randomUUID()
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
            edgeCaseBuilds[i] = cache.buildOrRetrieve(key, buildFunc, 500)
        }

        const results = await Promise.all(builds)
        const edgeCaseResults = await Promise.all(edgeCaseBuilds)

        expect(buildFunc).toHaveBeenCalledTimes(1)
        results.forEach((r) => expect(r).toBe(value))
        edgeCaseResults.forEach((r) => expect(r).toBe(value))
    })
    
    test("should retrieve existing once built", async () => {
        const key = crypto.randomUUID()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            return value
        })

        const firstResult = await cache.buildOrRetrieve(key, buildFunc, 500)
        expect(buildFunc).toHaveBeenCalledTimes(1)
        expect(firstResult).toBe(value)

        const buildFunc2 = jest.fn().mockImplementation(async () => {
            return "wrong value"
        })
        const builds = iterator(100).map(async () => cache.buildOrRetrieve(key, buildFunc2, 500))
        const results = await Promise.all(builds)

        expect(buildFunc2).not.toHaveBeenCalled()
        results.forEach((r) => expect(r).toBe(firstResult))
    })

    test("should allow immediate rebuild after error", async () => {
        const key = crypto.randomUUID()

        const builds = iterator(100).map(async (i) => {
            await sleep(i)
            return await cache.buildOrRetrieve(key, () => {
                if (i < 50) {
                    return Promise.reject(new Error('failure'))
                }
                else {
                    return Promise.resolve('success')
                }
            }, 500)
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
        const key = crypto.randomUUID()
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(3000)
            return ""
        })

        await expect(() => cache.buildOrRetrieve(key, buildFunc, 2000)).rejects.toThrow()
    })

    test("should allow rebuild after timeout even if build is in progress", async () => {
        const key = crypto.randomUUID()

        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return "build result"
        })
        const invalidBuild = cache.buildOrRetrieve(key, buildFunc, 500)

        await sleep(850)
        
        const buildFunc2 = jest.fn().mockImplementation(async () => {
            return "new build result"
        })
        const builds = iterator(200).map(async (i) => {
            await sleep(i)
            return await cache.buildOrRetrieve(key, buildFunc2, 500)
        })
        await expect(() => invalidBuild).rejects.toThrow()

        const results = await Promise.all(builds)

        results.forEach((r) => expect(r).toBe("new build result"))
    })
})

describe("Distributed Dictionary: asyncBuildOrRetrieve()", () => {
    let cache: DistributedDictionary<string, string>
    let redis: Redis

    beforeEach(async () => {
        const options: CacheOptions = {
            name: "test-cache",
            expiry: {
              type: ExpiryType.SLIDING,
              timeMs: 1000
            }
        }
    
        redis = new Redis('redis://localhost:6379')
        cache = await DistributedDictionaryFactory.create<string, string>(redis, options)
    })

    afterEach(async () => {
        await cache?.close()
        await redis.quit()
    })

    test("should call callback with result on success", async () => {
        const key = crypto.randomUUID()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            return value
        })
        const callback = jest.fn().mockImplementation((result, err) => {
            expect(result).toBeDefined()
            expect(err).toBeUndefined()
        })

        cache.asyncBuildOrRetrieve(key, buildFunc, callback, 1000)

        await sleep(200)

        expect(callback).toHaveBeenCalled()
    })

    test("should call error on error", async () => {
        const key = crypto.randomUUID()
        const buildFunc = jest.fn().mockImplementation(async () => {
            throw new Error()
        })
        const callback = jest.fn().mockImplementation((result, err) => {
            expect(result).toBeUndefined()
            expect(err).toBeDefined()
        })

        cache.asyncBuildOrRetrieve(key, buildFunc, callback, 1000)

        await sleep(200)

        expect(callback).toHaveBeenCalled()
    })
})

describe("Distributed Dictionary: get()", () => {
    let cache: DistributedDictionary<string, string>
    let redis: Redis

    beforeEach(async () => {
        const options: CacheOptions = {
            name: "test-cache",
            expiry: {
              type: ExpiryType.SLIDING,
              timeMs: 5 * 1000
            }
        }
    
        redis = new Redis('redis://localhost:6379')
        cache = await DistributedDictionaryFactory.create<string, string>(redis, options)
    })

    afterEach(async () => {
        await cache?.close()
        await redis.quit()
    })

    test("should wait for builds when getting with timeout", async () => {
        const key = crypto.randomUUID()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return value
        })

        const call = cache.buildOrRetrieve(key, buildFunc, 2000)
        await sleep(200)

        const gets = iterator(100).map(async () => cache.get(key, 3000))
        const results = await Promise.all(gets)

        const result = await call
        results.forEach((r) => expect(r).toBe(result))
    })

    test("should not wait for builds when getting with short timeout", async () => {
        const key = crypto.randomUUID()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return value
        })

        const call = cache.buildOrRetrieve(key, buildFunc, 2000)
        await sleep(200)

        const gets = iterator(100).map(async () => cache.get(key, 500))
        const results = await Promise.allSettled(gets)

        await call

        results.forEach((r) => expect(r.status).toBe("rejected"))
        results.forEach((r) => expect((r as PromiseRejectedResult).reason.message).toContain('Lock Wait Timeout'))
    })

    test("should error immediately when getting nonexistent key", async () => {
        const key = crypto.randomUUID()

        await expect(async () => cache.get(key, 1000)).rejects.toThrow(`Key ${key} does not exist in cache test-cache`)
    })
})

describe("Distributed Dictionary: status()", () => {
    let cache: DistributedDictionary<string, string>
    let redis: Redis

    beforeEach(async () => {
        const options: CacheOptions = {
            name: "test-cache",
            expiry: {
              type: ExpiryType.SLIDING,
              timeMs: 5 * 1000
            }
        }
    
        redis = new Redis('redis://localhost:6379')
        cache = await DistributedDictionaryFactory.create<string, string>(redis, options)
    })

    afterEach(async () => {
        await cache?.close()
        await redis.quit()
    })

    test("should return correct status", async () => {
        const key = crypto.randomUUID()
        const buildFunc = jest.fn().mockImplementation(async () => {
            await sleep(1000)
            return "build result"
        })
        expect(await cache.status(key)).toBe(KeyStatus.EMPTY)

        const call = cache.buildOrRetrieve(key, buildFunc, 2000)
        await sleep(250)
        expect(await cache.status(key)).toBe(KeyStatus.PENDING)

        await call
        expect(await cache.status(key)).toBe(KeyStatus.EXISTS)

        await cache.delete(key)
        expect(await cache.status(key)).toBe(KeyStatus.EMPTY)
    })
})

describe("Distributed Dictionary: delete()", () => {
    let cache: DistributedDictionary<string, string>
    let redis: Redis

    beforeEach(async () => {
        const options: CacheOptions = {
            name: "test-cache",
            expiry: {
              type: ExpiryType.SLIDING,
              timeMs: 5 * 1000
            }
        }
    
        redis = new Redis('redis://localhost:6379')
        cache = await DistributedDictionaryFactory.create<string, string>(redis, options)
    })

    afterEach(async () => {
        await cache?.close()
        await redis.quit()
    })

    test("should remove key and allow immediate rebuild after delete", async () => {
        const key = crypto.randomUUID()
        const value = "this is the result of some big expensive process"
        const buildFunc = jest.fn().mockImplementation(async () => {
            return value
        })

        await cache.buildOrRetrieve(key, buildFunc, 500)

        const builds = iterator(100).map(async (i) => {
            if (i === 1) {
                await cache.delete(key)
            }
            return await cache.buildOrRetrieve(key, buildFunc, 2000)
        })
        const results = await Promise.all(builds)

        expect(buildFunc).toHaveBeenCalledTimes(2)
        results.forEach((r) => expect(r).toBe(value))
    })
})