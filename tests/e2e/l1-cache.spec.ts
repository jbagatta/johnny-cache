import NodeCache from "node-cache"
import { CacheOptions, DistributedDictionary, ExpiryType } from "../../src/core/types"
import { sleep } from "./util"
import { DistributedDictionaryFactory } from "../../src/factory/distributed-dictionary-factory"
import Redis from "ioredis"

describe.only("Distributed Dictionary: L1 Cache Behavior", () => {
    let l1: NodeCache
    let cache: DistributedDictionary<string, string>
    let redis: Redis

    beforeEach(async () => {
        l1 = new NodeCache()
        const options: CacheOptions = {
            name: "test-cache",
            expiry: {
              type: ExpiryType.SLIDING,
              timeMs: 1000
            },
            l1CacheOptions: {enabled: true}
        }
    
        redis = new Redis('redis://localhost:6379')
        cache = await DistributedDictionaryFactory.create<string, string>(redis, options, l1)
    })

    afterEach(async () => {
        await cache?.close()
        await redis.quit()
    })

    test("should use L1 when exists", async () => {
        const key = "test-key"
        const value = "test-value"
        await cache.buildOrRetrieve(key, async () => value, 1000)

        expect(l1.get(key)).toBe(value)
    })

    test("should delete from L1 when key is deleted from remote cache", async () => {
        const key = "test-key"
        const value = "test-value"
        await cache.buildOrRetrieve(key, async () => value, 1000)

        expect(l1.get(key)).toBe(value)

        await cache.delete(key)
        expect(l1.get(key)).toBeUndefined()
    })

    test("should expire from L1", async () => {
        const expirySeconds = 1

        const key = "test-key"
        const value = "test-value"
        await cache.buildOrRetrieve(key, async () => value, 1000)

        expect(l1.get(key)).toBe(value)

        await sleep((1+expirySeconds) * 1000)
        expect(l1.get(key)).toBeUndefined()
    })
})

