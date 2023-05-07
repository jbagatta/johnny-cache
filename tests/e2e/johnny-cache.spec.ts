import { DistributedDictionary, ExpiryType } from '../../src/core/types'
import { CacheOptions } from '../../src/core/types'
import { NatsConnectionOptions, RedisConnectionOptions } from '../../src/factory/types'
import { DistributedCacheFactory } from '../../src/factory/distributed-dictionary-factory'

describe("Distributed Dictionary", () => {
    let cache: DistributedDictionary<string, string>

    beforeEach(async () => {
        const natsConnectOptions: NatsConnectionOptions = {
            urls: ["nats://localhost:4222"],
            token: "l0c4lt0k3n"
        }
        const redisConnectionOptions: RedisConnectionOptions = {
            url: "localhost:6379",
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
        cache = await DistributedCacheFactory.create<string, string>(natsConnectOptions, redisConnectionOptions, options)
    })

    afterEach(async () => {
        await cache?.close()
    })
    
    test("it should create", async () => {

    })
})