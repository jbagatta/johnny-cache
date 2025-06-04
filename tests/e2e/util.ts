import { Redis } from "ioredis"
import { connect } from "nats"
import { CacheOptions } from "../../src/core/types"
import { DistributedDictionaryFactory } from "../../src/factory/distributed-dictionary-factory"
import NodeCache from "node-cache"

export async function sleep(ms: number) {
    return new Promise((res) => {
        setTimeout(res, ms)
    })
}

export function iterator(num: number) {
    return Array.from(Array(num).keys())
}

export const redisInit = async (options: CacheOptions, l1?: NodeCache) => {
    const redis = new Redis('redis://localhost:6379')
    const cache = await DistributedDictionaryFactory.create<string, string>(redis, options, l1)

    return {cache, close: async () => {
        await cache.close()
        await redis.quit()
    }}
}

export const natsInit = async (options: CacheOptions, l1?: NodeCache) => {
    const nats = await connect({
        servers: ['nats://localhost:4222'],
        token: 'l0c4lt0k3n'
    })
    const cache = await DistributedDictionaryFactory.create<string, string>(nats, options, l1)

    return {cache, close: async () => {
        await cache.close()
        await nats.close()
    }}
}