export interface BuildReservation<V> {
  isNew: boolean
  buildKey: string
  completedBuild: V | null
}

export interface DataStore {
    tryReserve<V>(key: string, reservationExpiryMs: number): Promise<BuildReservation<V>>
    has(key: string): Promise<boolean>
    get<V>(key: string): Promise<V | null>
    set<V>(key: string, result: V): Promise<void>
    delete(...keys: string[]): Promise<void>
    updateKeyChainExpiry(key: string, chainedKey: string, expiry?: number): Promise<void>
    close(): void
}