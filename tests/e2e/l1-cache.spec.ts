import NodeCache from "node-cache"
import { CacheOptions, DistributedDictionary, ExpiryType } from "../../src/core/types"
import { natsInit, redisInit, sleep } from "./util"
import { DistributedDictionaryFactory } from "../../src/factory/distributed-dictionary-factory"
import Redis from "ioredis"

describe.each([natsInit, redisInit])("Distributed Dictionary: L1 Cache Behavior", (lockInit) => {
    let l1: NodeCache
    let cache: DistributedDictionary<string, string>
    let close: () => Promise<void>

    const options: CacheOptions = {
        name: "test-cache",
        expiry: {
          type: ExpiryType.SLIDING,
          timeMs: 1000
        },
        l1CacheOptions: {enabled: true}
    }

    beforeEach(async () => {
        l1 = new NodeCache()
        const {cache: c1, close: c2} = await lockInit(options, l1)
        cache = c1
        close = c2
    })

    afterEach(async () => {
        await close()
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

