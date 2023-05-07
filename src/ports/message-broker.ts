export interface BuildCompleteSignal {
    signalId: string
    result: BuildResult
    error?: Error
}

export enum BuildResult {
    COMPLETED,
    FAILED,
    TIMEOUT
}

export interface MessageBroker {
    publishSignal(signal: BuildCompleteSignal): Promise<void>
    waitForSignal(signalId: string, timeoutMs: number): Promise<BuildCompleteSignal>
    publishKeyDeleted(namespace: string, key: string): void
    onKeyDeleted(namespace: string, handle: (key: string) => void): void
    close(): Promise<void>
}