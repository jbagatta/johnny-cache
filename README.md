# Johnny Cache

A distributed caching that provides atomic read-through caching with exactly-once processing guarantees, as well as realtime eventing. Designed for coordinating expensive or long-running computations in a distributed environment, where redundant processing would be costly and/or unsafe.

Built on top of [JohnnyLocke](https://github.com/jbagatta/johnny-locke), it provides similar syntax and behavior to [.NET ConcurrentDictionary](https://learn.microsoft.com/en-us/dotnet/api/system.collections.concurrent.concurrentdictionary-2?view=net-9.0), but in a distributed environment.

## Features

- **Configurable Backend**
    - Supports both Redis and Nats under the hood
- **Real-time Eventing**
    - Notifies waiting processes when cached items are ready (or when to delete keys from l1)
    - Supports timeouts
- **L1 Cache Support**
    - Optional local in-memory cache with automatic invalidation
- **Expiry Policies**
    - Configurable sliding or absolute expiry times
- **Exactly-Once Processing**
    - Guarantees that expensive computations are performed exactly once across distributed processes
- **Strongly-Typed**
    - Written in TypeScript with full generic type support

## Architecture

Johnny Cache uses distributed locking to coordinate builds across multiple processes. The design relies on a single `key` that serves as both the lock key and the cache key, allowing for atomic operations against a single point of atomicity. As long as all processes use the same key to define identical `buildFunc` operations, efficient exactly-once processing is achieved.

When a client requests a value (via `buildOrRetrieve(key, buildFunc)`), the process reduces to a simple operation using `JohnnyLocke` distributed locking:
```typescript
await this.lock.withLock<T>(key, timeout
    async (existingValue: T | null) => {
        if (existingValue !== null) {
            return existingValue
        }
            
        return await buildFunc<T>()
    }
)
```

Once the process acquires the lock, it either returns the existing cached value or stores that value using the result of `buldFunc`. `JohnnyLocke` takes care of everything else!

## Usage

### Basic Setup

```typescript
import { DistributedDictionaryFactory, CacheOptions, ExpiryType } from 'johnny-cache';

// Configure cache options
const cacheOptions: CacheOptions = {
    name: "my-cache",
    expiry: {
        type: ExpiryType.SLIDING,
        timeMs: 60 * 1000 
    },
    l1CacheOptions: {
        enabled: true,
        purgeIntervalSeconds: 60
    }
};

// use redis or nats
const redis = new Redis('redis://localhost:6379')
//const nats = await connect({servers: ['nats://localhost:4222']})

// Create cache instance
const cache = await DistributedDictionaryFactory.create<string, string>(redis, cacheOptions);
```

### Basic Operations

```typescript
// Build or retrieve a value
const result = await cache.buildOrRetrieve(
    "my-key",   // lock/cache key
    async () => "Expensive computation value",
    5000        // timeout in ms
);

// Until cache expiry, future calls will not run buildFunc
const sameResult = await cache.buildOrRetrieve("my-key", async () => {throw new Error()}, 100);

// Get an existing value
const value = await cache.get("my-key", 1000); 

// Check key status (KeyStatus.EMPTY, PENDING, or EXISTS)
const status = await cache.status("my-key"); 

// Delete a key
await cache.delete("my-key");

// Using callbacks instead
cache.asyncBuildOrRetrieve(
    "my-key",
    async () => "computed value",
    async (value, err) => console.log("Success:", value, err),
    5000
);

// Cleanup
await cache.close();
```

## Configuration Options

### CacheOptions

```typescript
interface CacheOptions {
    name: string;                      // Namespace for the cache
    expiry?: {                         // Optional expiry configuration
        type: ExpiryType;              // SLIDING or ABSOLUTE
        timeMs: number;                // Expiry time in milliseconds
    };
    l1CacheOptions?: {                 // Optional L1 cache configuration
        enabled: boolean;              // Whether to enable L1 cache
        purgeIntervalSeconds?: number; // How often to check for expired items
    };
}
```

## Advanced Features

### L1 Cache

L1 caching is provided using `NodeCache`. The L1 cache provides a local in-memory cache layer that can significantly improve performance for frequently accessed items. 

When l1 caching is enabled:
- Values are stored in local memory after first retrieval
- All connected caches automatically invalidated when keys are deleted
    - Eventing to other processes provided via Core Nats or Redis Pubsub
- Supports both sliding and absolute expiry times, synchronized to the configured values
- Configurable purge interval for expired items

### Expiry Types

- **Sliding**: Expiry time resets on each access
- **Absolute**: Expiry time is fixed from when the value is first created

## Running Tests

Spin up a test environment with Redis and Nats servers using docker compose:
```
docker compose -f tests/docker-compose.yml up -d
```

and then run the tests:
```
npm run test
```

## License

MIT 