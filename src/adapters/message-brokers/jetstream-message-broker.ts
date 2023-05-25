import { AckPolicy, DeliverPolicy, DiscardPolicy, JsMsg, Msg, NatsConnection, NatsError, ReplayPolicy, RetentionPolicy, StorageType, StringCodec, connect, nanos } from "nats";
import { BuildCompleteSignal, BuildResult, MessageBroker } from "../../ports/message-broker";

const buildSignalPrefix = 'jc.builds'
const keyDeletePrefix = 'jc.events'

export class JetstreamMessageBroker implements MessageBroker {
    constructor(
        private readonly client: NatsConnection, 
        private readonly stream: string
    ) { }

    async waitForSignal(signalId: string, timeoutMs: number): Promise<BuildCompleteSignal> {
        const jsm = await this.client.jetstreamManager()
        const consumer = await jsm.consumers.add(this.stream, {
            filter_subject: `${buildSignalPrefix}.${signalId}`,
            deliver_policy: DeliverPolicy.Last,
            replay_policy: ReplayPolicy.Instant,
            ack_policy: AckPolicy.Explicit,
            inactive_threshold: nanos(1000 * 60)
        })

        let msg: JsMsg
        try {
            msg = await this.client.jetstream().pull(this.stream, consumer.name, timeoutMs)
            msg.ack()
        }
        catch {
            return {
                signalId: signalId,
                result: BuildResult.TIMEOUT
            }
        }
            
        return JSON.parse(StringCodec().decode(msg.data)) as BuildCompleteSignal
    }
    
    async publishSignal(signal: BuildCompleteSignal): Promise<void> {
        const subject = `${buildSignalPrefix}.${signal.signalId}`

        await this.client.jetstream().publish(subject, StringCodec().encode(JSON.stringify(signal)))
    }

    async publishKeyDeleted(namespace: string, key: string): Promise<void> {
        const subject = `${keyDeletePrefix}.${namespace}.${key}`

        this.client.publish(subject, StringCodec().encode(key))
    }
    
    async onKeyDeleted(namespace: string, handle: (key: string) => void): Promise<void> {
        this.client.subscribe(`${keyDeletePrefix}.${namespace}`, {
            callback: (err: NatsError | null, msg: Msg | null) => {
                if (!msg) { return }

                const key = StringCodec().decode(msg.data)
                handle(key)
            },
        })
    }

    async close(): Promise<void> {
        await this.client.close()
    }
}

export class NatsConnectionOptions {
    urls!: string[]
    stream!: string
    token?: string
    userPass?: {
        user: string
        pass: string
    }
}

export async function createJetstreamMessageBroker(natsConnectionOptions: NatsConnectionOptions): Promise<JetstreamMessageBroker> {
    const natsClient = await connect({
        servers: natsConnectionOptions.urls,
        token: natsConnectionOptions.token,
        user: natsConnectionOptions.userPass?.user,
        pass: natsConnectionOptions.userPass?.pass
    })

    const jsm = await natsClient.jetstreamManager()
    const existingStream = (await jsm.streams.names().next()).find((s) => s === natsConnectionOptions.stream)
    if (!existingStream) {
        await jsm.streams.add({
            name: natsConnectionOptions.stream,
            retention: RetentionPolicy.Limits,
            storage: StorageType.Memory,
            discard: DiscardPolicy.Old,
            max_age: nanos(30*1000),
            subjects: ["jc.builds.*", "jc.events.*"]
        })
    }
    
    return new JetstreamMessageBroker(natsClient, natsConnectionOptions.stream!)
}