import { BuildCompleteSignal, BuildResult, MessageBroker } from "../../ports/message-broker";
import { Redis } from "ioredis";
import { RedisConnectionOptions } from "../data-stores/redis-data-store";

const buildSignalPrefix = 'jc-builds'
const keyDeletePrefix = 'jc-events'

export class RedisMessageBroker implements MessageBroker {
    constructor(
        private readonly client: Redis
    ) { }

    async waitForSignal(signalId: string, timeoutMs: number): Promise<BuildCompleteSignal> {
        const subject = `${buildSignalPrefix}-${signalId}`

        const results = await this.client.duplicate().xread("COUNT", 1, "BLOCK", timeoutMs, "STREAMS", subject, '$')
        if (!results) {
            return {
                signalId: signalId,
                result: BuildResult.TIMEOUT
            }
        }

        const [_, messages] = results[0]
        return JSON.parse(messages[0][1][1]) as BuildCompleteSignal
    }
    
    async publishSignal(signal: BuildCompleteSignal): Promise<void> {
        const subject = `${buildSignalPrefix}-${signal.signalId}`

        await this.client.multi()
            .xadd(subject, '*', 'signal', JSON.stringify(signal))
            .expire(subject, 5)
            .exec()
    }

    async publishKeyDeleted(namespace: string, key: string): Promise<void> {
        const subject = `${keyDeletePrefix}-${namespace}`

        await this.client.publish(subject, key)
    }
    
    async onKeyDeleted(namespace: string, handle: (key: string) => void): Promise<void> {
        await this.client.duplicate().subscribe(`${keyDeletePrefix}-${namespace}`, (err, key) => {
            const keyToDelete = key as string
            if (keyToDelete) {
                handle(keyToDelete)
            }
        })
    }

    async close(): Promise<void> {
        this.client.disconnect()
    }
}

export function createRedisMessageBroker(redisConnectionOptions: RedisConnectionOptions): RedisMessageBroker {
    let redisClient: Redis
    if (redisConnectionOptions.sentinel) {
        redisClient = new Redis({
            sentinels: [ { host: redisConnectionOptions.sentinel.host, port: redisConnectionOptions.sentinel.port } ],
            name: redisConnectionOptions.sentinel.primaryName,
            password: redisConnectionOptions.password,
            sentinelPassword: redisConnectionOptions.password
        })
    }
    else {
        redisClient = new Redis({
            path: redisConnectionOptions.url,
            password: redisConnectionOptions.password
        })
    } 
    
    return new RedisMessageBroker(redisClient)
}