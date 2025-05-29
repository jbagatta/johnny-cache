# Johnny Cache

A distributed locking strategy that provides atomic read-through caching with exactly-once processing guarantees, as well as realtime eventing. Designed for coordinating expensive or long-running computations in a distributed environment, where redundant processing would be costly and/or unsafe.

## Features

- **Configurable Data Store / Message Broker** 
    - Can use Redis for distributed locking/caching
        - Nats Jetstream and ORM Database implementations in progress
    - Can use Redis or Nats Jetstream as the underlying message broker
- **Real-time Eventing**
    - Notifies waiting processes when cached items are ready (or when the build process errored) 
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

When a process requests a value (via `buildOrRetrieve(key, buildFunc)`), JohnnyCache will:
1. Check the local L1 cache for an existing value (if enabled)
    - Return this value if found
2. Attempt to acquire the distributed lock for `key` via the data store
3. If the lock is acquired, the acquiring process will:
    - Run the `buildFunc`
    - Update the cache with the result (which lives atomically with the lock key itself)
        - Also updates the local l1, if applicable
    - Emit an event to notify waiting processes to wake up and check the cache
    - Return the value
    - *If the buildFunc fails, the lock is cleared and errors are emitted to waiting processes instead*
4. If the lock is not acquired, JohnnyCache will check the lock payload for an existing cached value
    - If the value is found, it is returned directly
    - Otherwise, another process is running the `buildFunc` - the process will wait to be notified of its completion, and then retrieve from the cache
    - In both cases, JohnnyCache also updates the local l1 cache, if applicable

## Usage

### Basic Setup

```typescript
import { DistributedDictionaryFactory, CacheOptions, ExpiryType } from 'johnny-cache';
import { RedisConnectionOptions } from 'johnny-cache';
import { NatsConnectionOptions } from 'johnny-cache';

// Configure Redis for data store
const redisOptions: RedisConnectionOptions = {
    sentinel: {
        host: "localhost",
        port: 26379,
        primaryName: "primary",
    },
    password: "your-password"
};

// Configure NATS JetStream for message broker
const natsOptions: NatsConnectionOptions = {
    urls: ["nats://localhost:4222"],
    token: "your-token",
    stream: "jc"
};

// Configure cache options
const cacheOptions: CacheOptions = {
    name: "my-cache",
    expiry: {
        type: ExpiryType.SLIDING,
        timeMs: 60 * 1000 
    },
    l1CacheOptions: {
        enabled: true,
        purgeIntervalSeconds: 600 
    }
};

// Create cache instance
const cache = await DistributedDictionaryFactory.create<string, string>(
    redisOptions,
    natsOptions,
    cacheOptions
);
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
    5000,
    async (value) => console.log("Success:", value),
    async (error) => console.error("Error:", error)
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

L1 caching is provided using `NodeCache`. The L1 cache provides a local in-memory cache layer that can significantly improve performance for frequently accessed items. When enabled:

- Values are stored locally after first retrieval
- Cache is automatically invalidated when keys are deleted
- Supports both sliding and absolute expiry times
- Configurable purge interval for expired items

### Expiry Types

- **Sliding**: Expiry time resets on each access
- **Absolute**: Expiry time is fixed from when the value is first cached

### Error Handling

The cache provides robust error handling:

- Build function errors are propagated to all waiting processes
- Timeout errors are handled gracefully
- Failed builds can be retried

## Best Practices

1. **Timeout Configuration**
   - Set appropriate timeouts for your `buildOrRetrieve` calls
   - Consider the expected duration of your expensive computations
   - Account for network latency in distributed environments
2. **L1 Cache Usage**
   - Enable L1 cache for frequently accessed items
3. **Error Handling**
   - Always implement error callbacks for async operations
   - Handle timeout scenarios appropriately
   - Implement retry logic for transient failures

## Running Tests

### Unit Tests

Run `npm test`

### E2E Tests

Spin up a test environment with redis and nats servers using docker compose:
```
docker compose -f tests/docker-compose.yml up -d
```

and then run the e2e tests:
```
npm run test:e2e
```

## License

MIT 