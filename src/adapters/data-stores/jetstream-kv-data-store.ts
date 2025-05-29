import { BuildReservation } from "../.."
import { DataStore } from "../..";

// TODO Implement once nats client supports 2.11 per-message TTL feature

export class JetStreamDataStore implements DataStore {

    async tryReserve<V>(key: string, reservationExpiryMs: number): Promise<BuildReservation<V>> {
        // this should use Nats-TTL headers to set the reservationExpiryMs on the published message
        // DiscaryNewPerSubject to ensure the lock is atomic and singular
        // the payload when creating should include the buildId and a null buildResult
        return null as any
    }
    async has(key: string): Promise<boolean> {
        // use direct get by subject
        return null as any
    }
    async get<V>(key: string): Promise<BuildReservation<V> | null> {
        // use direct get by subject
        return null as any
    }
    async tryUpdateReservation<V>(key: string, buildId: string, result: V, expiry?: number): Promise<boolean>{
        // Nats-Rollup header to replace the previous message
        // stream needs to allow rollup
        // the payload when creating should include the buildId and result as the buildResult
        // use expect.lastSubjectSequence option to ensure we're using the same reservation
        return null as any
    }
    async delete(key: string): Promise<void> {
        // user purge by subject
        return null as any
    }
    async updateExpiry(key: string, expiry?: number): Promise<void> {
        // Nats-Rollup header to replace the previous message
        // the payload should be identical to the existing one, just republished to reset ttl
        return null as any
    }
    async close(): Promise<void> {
        // i dont think we need to do anything here
        return null as any
    }
}
