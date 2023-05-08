import { DataStore } from "../ports/data-store"
import { BuildResult, MessageBroker } from "../ports/message-broker"
import { L1Cache } from "./l1-cache"
import { CacheOptions, DistributedDictionary, ExpiryType, KeyStatus } from "./types"

export class JohnnyCache<K, V> implements DistributedDictionary<K, V> {
    constructor(
        private readonly dataStore: DataStore,
        private readonly messageBroker: MessageBroker,
        private readonly cacheOptions: CacheOptions,
        private readonly l1Cache: L1Cache<V> = new L1Cache<V>()
    ) { 
        if (this.cacheOptions.l1CacheOptions?.enabled && this.cacheOptions.l1CacheOptions?.purgeIntervalMs) {
            this.l1Cache.setPurgeInterval(this.cacheOptions.l1CacheOptions.purgeIntervalMs)
        }

        this.messageBroker.onKeyDeleted(this.cacheOptions.name, (key: string) => {
            const handleDelete = () => this.l1Cache.delete(key)
            handleDelete.bind(this)
            handleDelete()
        })
    }

    private namespacedKey = (key: K) => `${this.cacheOptions.name}/${key}`

    public asyncBuildOrRetrieve(
        key: K, 
        buildFunc: () => Promise<V>, 
        timeoutMs: number, 
        callback: (value: V) => Promise<void>, 
        error: (err: any) => Promise<void>
    ): void {
        this.buildOrRetrieve(key, buildFunc, timeoutMs)
            .then(async (result: V) => {
                await callback(result)
            })
            .catch(async (err) => {
                await error(err)
            })
    }

    public async buildOrRetrieve(
        key: K, 
        buildFunc: () => Promise<V>, 
        timeoutMs: number
    ): Promise<V> {
        const namespacedKey = this.namespacedKey(key)
        const localValue = this.tryGetFromL1Cache(namespacedKey)
        if (localValue) { return localValue }

        const buildReservation = await this.dataStore.tryReserve<V>(namespacedKey, timeoutMs)
        if (buildReservation.isNew) {
            try {
                return await this.handleBuild(namespacedKey, buildReservation.buildId, buildFunc)
            } catch (err) {
                throw await this.handleError(namespacedKey, buildReservation.buildId, err)
            }
        }
        else { 
            let result = buildReservation.completedBuild
            if (result === null) {
                await this.waitForBuildCompletion(buildReservation.buildId, timeoutMs) 

                const completedBuild = await this.dataStore.get<V>(namespacedKey)
                if (!completedBuild?.completedBuild) {
                    throw new Error(`A timeout occurred waiting for Build ${buildReservation.buildId} to complete`)
                } 
                result = completedBuild.completedBuild
            }

            this.updateExpiry(namespacedKey)
            this.insertIntoL1Cache(namespacedKey, result)
                
            return result
        }
    }

    public async status(key: K): Promise<KeyStatus> {
        const namespacedKey = this.namespacedKey(key)
        const build = await this.dataStore.get<V>(namespacedKey) 
        if (build === null) {
            return KeyStatus.EMPTY
        }

        return await build.completedBuild !== null 
            ? KeyStatus.EXISTS 
            : KeyStatus.PENDING
    }

    public async get(key: K, timeoutMs?: number): Promise<V> {
        const namespacedKey = this.namespacedKey(key)
        const localValue = this.tryGetFromL1Cache(namespacedKey)
        if (localValue) { return localValue }

        let build = await this.dataStore.get<V>(namespacedKey)
        if (build && build.completedBuild === null && timeoutMs) {
            await this.waitForBuildCompletion(build.buildId, timeoutMs) 

            build = await this.dataStore.get<V>(namespacedKey)
        }
        if (!build?.completedBuild) {
            throw new Error(`Key ${key} does not exist in cache ${this.cacheOptions.name}`)
        }

        this.updateExpiry(namespacedKey)
        this.insertIntoL1Cache(namespacedKey, build.completedBuild)
            
        return build.completedBuild
    }

    public async delete(key: K): Promise<void> {
        const namespacedKey = this.namespacedKey(key)

        this.l1Cache.delete(namespacedKey)
        this.messageBroker.publishKeyDeleted(this.cacheOptions.name, namespacedKey as string)
        await this.dataStore.delete(namespacedKey)
    }

    public async close(): Promise<void> {
        this.dataStore.close()
        await this.messageBroker.close()
    }

    private async handleBuild(namespacedKey: string, buildId: string, buildFunc: () => Promise<V>): Promise<V> {
        const value = await buildFunc()
    
        if (!await this.dataStore.tryUpdateReservation(namespacedKey, buildId, value, this.cacheOptions.expiry?.timeMs)) {
            throw new Error(`Build ${buildId} is no longer valid`)
        }

        this.insertIntoL1Cache(namespacedKey, value)

        await this.messageBroker.publishSignal({
            signalId: buildId,
            result: BuildResult.COMPLETED
        })
    
        return value
    }

    private async handleError(namespacedKey: string, buildId: string, err: any): Promise<Error> {
        const error = err as Error ?? new Error(`An unknown error occurred: ${err}`)
        console.error(err)

        await this.dataStore.delete(namespacedKey)
        await this.messageBroker.publishSignal({
            signalId: buildId,
            result: BuildResult.FAILED,
            error: error
        })

        return error
    }

    private async waitForBuildCompletion(buildId: string, timeoutMs: number): Promise<void> {
        const signal = await this.messageBroker.waitForSignal(buildId, timeoutMs)

        if (signal.result === BuildResult.FAILED) {
            throw signal.error
        }
        if (signal.result === BuildResult.TIMEOUT) {
            console.warn(`A timeout occurred waiting for build ${buildId} to complete`)
        }
    }

    private insertIntoL1Cache(key: string, value: V): void {
        if (this.cacheOptions.l1CacheOptions?.enabled) {
            this.l1Cache.set(key, value, this.cacheOptions.expiry)
        }
    }

    private tryGetFromL1Cache(namespacedKey: string): V | null {
        const localValue = this.l1Cache.get(namespacedKey)
        if (!localValue) { return null }

        this.updateExpiry(namespacedKey)
        
        return localValue
    }

    private updateExpiry(namespacedKey: string) {
        if (this.cacheOptions.expiry?.type === ExpiryType.SLIDING) {
            this.dataStore.updateExpiry(namespacedKey, this.cacheOptions.expiry?.timeMs)
                .then(() => {})
                .catch((err) => {
                    console.error(`Could not update expiry for key ${namespacedKey} due to: ${err}`)
                })
        }
    }
}
