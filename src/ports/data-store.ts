export interface BuildReservation<V> {
  isNew: boolean
  buildId: string
  completedBuild: V | null
}

export interface DataStore {
    tryReserve<V>(key: string, reservationExpiryMs: number): Promise<BuildReservation<V>>
    has(key: string): Promise<boolean>
    get<V>(key: string): Promise<BuildReservation<V> | null>
    tryUpdateReservation<V>(key: string, buildId: string, result: V, expiry?: number): Promise<boolean>
    delete(key: string): Promise<void>
    updateExpiry(key: string, expiry?: number): Promise<void>
    close(): void
}