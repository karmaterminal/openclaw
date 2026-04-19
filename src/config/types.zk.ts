/**
 * ZooKeeper coordination config. Consumed by `src/plugin-sdk/zk`
 * (createZkClient) + `src/cli/zk-cli.ts`. Resolution precedence at read
 * time:
 *
 *   CLI flag (e.g. `--hosts`)  >  ZK_HOSTS env var
 *                              >  openclaw config (this type)
 *                              >  default (`zk-client.fleet-coordination.svc.cluster.local:2181`)
 *
 * The `ZK_HOSTS` env precedence matches the kazoo + Python `fleet_lock.py`
 * muscle memory and is non-negotiable. If no config is set and the
 * default DNS name doesn't resolve from the host, `createZkClient`
 * fails fast with an explicit operator message — no silent tailnet
 * sniffing.
 */

export type ZkConfig = {
  /** Comma-separated ZK connection string ("host1:port,host2:port"). */
  hosts?: string;
  /** Chroot path applied to every operation (ZK 3.5+). */
  chroot?: string;
  /** Session timeout in milliseconds (default 10_000). */
  sessionTimeoutMs?: number;
  /** Connect timeout in milliseconds (default 5_000). */
  connectTimeoutMs?: number;
};
