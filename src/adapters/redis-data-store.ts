import { Redis } from "ioredis"
import { BuildReservation, DataStore } from "../ports/data-store"
import { v4 } from "uuid"

export class RedisDataStore implements DataStore {
    constructor(private readonly client: Redis) {}

    async tryReserve<V>(key: string, reservationExpiryMs: number): Promise<BuildReservation<V>> {
        const buildKey = v4()
        const result = await this.client.eval(tryReserveAndReturnExistingBuildLuaScript, 1, key, buildKey, reservationExpiryMs) as string[]

        return {
            isNew: result[0] === buildKey,
            buildKey: result[0],
            completedBuild: result[1] ? JSON.parse(result[1]) as V : null
        }
    }

    async has(key: string): Promise<boolean> {
        return await this.client.exists(key) === 1
    }

    async get<V>(key: string): Promise<V | null> {
        const result = await this.client.get(key)

        return result ? JSON.parse(result) as V : null
    }

    async set<V>(key: string, result: V): Promise<void> {
        const resultString = JSON.stringify(result)
        
        await this.client.set(key, resultString)
    }

    async delete(...keys: string[]): Promise<void> {
        const multi = this.client.multi()
        keys.forEach((key) => multi.del(key))
        await multi.exec()
    }

    async updateKeyChainExpiry(key: string, chainedKey: string, expiry?: number): Promise<void> {
        if (expiry) {
          await this.client.eval(keyChainExpiryUpdateLuaScript, 1, key, chainedKey, expiry)
        }
    }

    close(): void {
        this.client.disconnect()
    }
}

export const tryReserveAndReturnExistingBuildLuaScript = " \
  local isNew = redis.call('SETNX', KEYS[1], ARGV[1]) \
  if (isNew == 1) \
      redis.call('EXPIRE', KEYS[1], ARGV[2]) \
      return {ARGV[1], nil} \
  else \
      local buildKey = redis.call('GET', KEYS[1]) \
      local buildResult = redis.call('GET', buildKey) \
      if (not buildResult) \
          return {buildKey, nil} \
      else \
          return {buildKey, result} \
      end \
  end \
"

export const keyChainExpiryUpdateLuaScript = " \
  local buildKey = redis.call('GET', KEYS[1]) \
  if (not buildKey) or (buildKey ~= ARGV[1]) \
      return false \
  end \
  redis.call('EXPIRE', KEYS[1], ARGV[2]) \
  redis.call('EXPIRE', ARGV[1], ARGV[2]) \
  return true \
"