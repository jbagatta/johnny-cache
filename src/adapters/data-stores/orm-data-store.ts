import { BuildReservation } from "../.."
import { DataStore } from "../..";

// TODO Implement 
// Database data store is not really a cache - should probably not support expiry

// Support TypeOrm, Sequelize and Prisma too - need ORM abstraction layer

export class OrmDataStore implements DataStore {

    async tryReserve<V>(key: string, reservationExpiryMs: number): Promise<BuildReservation<V>> {
        // use unique constraint on key, try to insert
        // can time out the lock using created date + reservationExpiryMs
        return null as any
    }
    async has(key: string): Promise<boolean> {
        // select where key = key
        return null as any
    }
    async get<V>(key: string): Promise<BuildReservation<V> | null> {
        // select where key = key
        return null as any
    }
    async tryUpdateReservation<V>(key: string, buildId: string, result: V, expiry?: number): Promise<boolean>{
        // update where key = key, verify buildId matches
        // expiry not supported in DB
        return null as any
    }
    async delete(key: string): Promise<void> {
        // delete where key = key
        return null as any
    }
    async updateExpiry(key: string, expiry?: number): Promise<void> {
        // expiry not supported in DB
        return null as any
    }
    async close(): Promise<void> {
        return null as any
    }
}
