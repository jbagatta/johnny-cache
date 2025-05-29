import NodeCache from "node-cache"
import { createTestCache } from "./util"
import { DistributedDictionary } from "../../src/core/types"
import { sleep } from "./util"
import { DistributedDictionaryFactory } from "../../src/factory/distributed-dictionary-factory"
import { createRedisDataStore } from "../../src/adapters/data-stores/redis-data-store"
import { createRedisMessageBroker } from "../../src/adapters/message-brokers/redis-message-broker"

describe("Distributed Dictionary: L1 Cache Behavior", () => {
    let cache: DistributedDictionary<string, string>
    let l1: NodeCache

    beforeEach(async () => {
        l1 = new NodeCache()
    })

    afterEach(async () => {
        await cache?.close()
    })

    test("should disable L1 when onKeyDeleted subscription fails", async () => {
        const redisOptions = {
            sentinel: {
                host: "localhost",
                port: 26379,
                primaryName: "mymaster",
            },
            password: "l0c4lt0k3n"
        }

        // Create a message broker that will fail to subscribe to onKeyDeleted
        const messageBroker = createRedisMessageBroker(redisOptions)
        messageBroker.onKeyDeleted = jest.fn().mockRejectedValue(new Error("test"))

        const options = {
            name: "test-cache",
            l1CacheOptions: {
                enabled: true
            }
        }

        cache = await DistributedDictionaryFactory.createCustom(
            createRedisDataStore(redisOptions),
            messageBroker,
            options,
            l1
        )

        const key = "test-key"
        const value = "test-value"
        await cache.buildOrRetrieve(key, async () => value, 1000)
        
        expect(l1.get(`test-cache/${key}`)).toBeUndefined()
    })

    test("should use L1 when onKeyDeleted subscription succeeds", async () => {
        cache = await createTestCache<string, string>(l1)

        const key = "test-key"
        const value = "test-value"
        await cache.buildOrRetrieve(key, async () => value, 1000)

        expect(l1.get(`test-cache/${key}`)).toBe(value)
    })

    test("should delete from L1 when key is deleted from remote cache", async () => {
        cache = await createTestCache<string, string>(l1)

        const key = "test-key"
        const value = "test-value"
        await cache.buildOrRetrieve(key, async () => value, 1000)

        expect(l1.get(`test-cache/${key}`)).toBe(value)

        await cache.delete(key)
        expect(l1.get(`test-cache/${key}`)).toBeUndefined()
    })

    test("should expire from L1", async () => {
        const expirySeconds = 1
        cache = await createTestCache<string, string>(l1, expirySeconds)

        const key = "test-key"
        const value = "test-value"
        await cache.buildOrRetrieve(key, async () => value, 1000)

        expect(l1.get(`test-cache/${key}`)).toBe(value)

        await sleep((1+expirySeconds) * 1000)
        expect(l1.get(`test-cache/${key}`)).toBeUndefined()
    })
})

