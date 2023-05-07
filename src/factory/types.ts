export interface RedisSentinelOptions {
    url: string
    port: number,
    primaryName: string,
}

export interface RedisConnectionOptions {
    sentinel?: RedisSentinelOptions, 
    url?: string
    password?: string
}

export interface NatsConnectionOptions {
    urls: string[]
    token?: string
}
