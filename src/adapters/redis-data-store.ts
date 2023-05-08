import { Redis } from "ioredis"
import { BuildReservation, DataStore } from "../ports/data-store"
import { v4 } from "uuid"

const buildIdField = 'buildId'
const buildResultField = 'buildResult'

export class RedisDataStore implements DataStore {
    constructor(private readonly client: Redis) {}

    async tryReserve<V>(key: string, reservationExpiryMs: number): Promise<BuildReservation<V>> {
        const buildId = v4()
        const result = await this.client.eval(tryReserveAndReturnExistingBuildLuaScript, 1, key, buildId, reservationExpiryMs) as string[]

        return {
            isNew: result[0] === buildId,
            buildId: result[0],
            completedBuild: result[1] ? JSON.parse(result[1]) as V : null
        }
    }

    async has(key: string): Promise<boolean> {
        return await this.client.exists(key) === 1
    }

    async get<V>(key: string): Promise<BuildReservation<V> | null> {
        const result = await this.client.hgetall(key)
        if (Object.keys(result).length === 0) {
            return null
        }

        return {
            isNew: false,
            buildId: result[buildIdField],
            completedBuild: buildResultField in result ? JSON.parse(result[buildResultField]) as V : null
        }
    }

    async tryUpdateReservation<V>(key: string, buildId: string, result: V, expiry?: number | undefined): Promise<boolean> {
        return await this.client.eval(tryUpdateReservationLuaScript, 1, key, buildId, JSON.stringify(result), expiry ?? -1) as boolean
    }

    async delete(key: string): Promise<void> {
        await this.client.del(key)
    }

    async updateExpiry(key: string, expiry?: number): Promise<void> {
        if (expiry) {
          await this.client.expire(key, expiry / 1000)
        }
    }

    close(): void {
        this.client.disconnect()
    }
}

export const tryReserveAndReturnExistingBuildLuaScript = ` \
  local isNew = redis.call('HSETNX', KEYS[1], '${buildIdField}', ARGV[1]) \
  if (isNew == 1) then \
      redis.call('EXPIRE', KEYS[1], ARGV[2]) \
      return {ARGV[1], nil} \
  else \
      local buildKey = redis.call('HGET', KEYS[1], '${buildIdField}') \
      local buildResult = redis.call('HGET', KEYS[1], '${buildResultField}') \
      return {buildKey, buildResult} \
  end \
`

export const tryUpdateReservationLuaScript = ` \
  local exists = redis.call('EXISTS', KEYS[1]) \
  if (not exists) then \
      redis.call('HSET', KEYS[1], '${buildIdField}', ARGV[1]) \
  end \
  if (redis.call('HGET', KEYS[1], '${buildIdField}') == ARGV[1]) then \
      redis.call('HSET', KEYS[1], '${buildResultField}', ARGV[2]) \
      if (ARGV[3] == -1) then \
          redis.call('PERSIST', KEYS[1]) \
      else \
          redis.call('EXPIRE', KEYS[1], ARGV[3]) \
      end \
      return true \
  else \
      return false \
  end \
`