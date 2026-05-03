export declare const BUNDLED_RUNTIME_DEPS_LOCK_DIR = ".openclaw-runtime-deps.lock";
type RuntimeDepsLockOwner = {
    pid?: number;
    starttime?: number;
    createdAtMs?: number;
    ownerFileState: "ok" | "missing" | "invalid";
    ownerFilePath: string;
    ownerFileMtimeMs?: number;
    ownerFileIsSymlink?: boolean;
    lockDirMtimeMs?: number;
};
export declare function shouldRemoveRuntimeDepsLock(owner: Pick<RuntimeDepsLockOwner, "pid" | "starttime" | "createdAtMs" | "lockDirMtimeMs" | "ownerFileMtimeMs">, nowMs: number, isAlive?: (pid: number) => boolean, readStarttime?: (pid: number) => number | null): boolean;
export declare function formatRuntimeDepsLockTimeoutMessage(params: {
    lockDir: string;
    owner: RuntimeDepsLockOwner;
    waitedMs: number;
    nowMs: number;
}): string;
export declare function removeRuntimeDepsLockIfStale(lockDir: string, nowMs: number): boolean;
export declare function withBundledRuntimeDepsFilesystemLock<T>(installRoot: string, lockName: string, run: () => T): T;
export declare function withBundledRuntimeDepsFilesystemLockAsync<T>(installRoot: string, lockName: string, run: () => Promise<T>): Promise<T>;
export {};
