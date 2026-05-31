import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  captureEnv,
  captureFullEnv,
  captureHermeticOpenclawEnv,
  createPathResolutionEnv,
  listOpenclawEnvKeys,
  withEnv,
  withEnvAsync,
  withHermeticOpenclawEnv,
  withHermeticOpenclawEnvAsync,
  withPathResolutionEnv,
} from "./env.js";

function restoreEnvKey(key: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = previous;
  }
}

describe("env test utils", () => {
  it("captureEnv restores mutated keys", () => {
    const keyA = "OPENCLAW_ENV_TEST_A";
    const keyB = "OPENCLAW_ENV_TEST_B";
    const snapshot = captureEnv([keyA, keyB]);
    const prevA = process.env[keyA];
    const prevB = process.env[keyB];
    process.env[keyA] = "mutated";
    delete process.env[keyB];

    snapshot.restore();

    expect(process.env[keyA]).toBe(prevA);
    expect(process.env[keyB]).toBe(prevB);
  });

  it("captureFullEnv restores added keys and baseline values", () => {
    const key = "OPENCLAW_ENV_TEST_ADDED";
    const prevHome = process.env.HOME;
    const snapshot = captureFullEnv();
    process.env[key] = "1";
    delete process.env.HOME;

    snapshot.restore();

    expect(process.env[key]).toBeUndefined();
    expect(process.env.HOME).toBe(prevHome);
  });

  it("withEnv applies values only inside callback", () => {
    const key = "OPENCLAW_ENV_TEST_SYNC";
    const prev = process.env[key];

    const seen = withEnv({ [key]: "inside" }, () => process.env[key]);

    expect(seen).toBe("inside");
    expect(process.env[key]).toBe(prev);
  });

  it("withEnv restores values when callback throws", () => {
    const key = "OPENCLAW_ENV_TEST_SYNC_THROW";
    const prev = process.env[key];

    expect(() =>
      withEnv({ [key]: "inside" }, () => {
        expect(process.env[key]).toBe("inside");
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(process.env[key]).toBe(prev);
  });

  it("withEnv can delete a key only inside callback", () => {
    const key = "OPENCLAW_ENV_TEST_SYNC_DELETE";
    const prev = process.env[key];
    process.env[key] = "outer";

    const seen = withEnv({ [key]: undefined }, () => process.env[key]);

    expect(seen).toBeUndefined();
    expect(process.env[key]).toBe("outer");
    restoreEnvKey(key, prev);
  });

  it("withEnvAsync restores values when callback throws", async () => {
    const key = "OPENCLAW_ENV_TEST_ASYNC";
    const prev = process.env[key];

    await expect(
      withEnvAsync({ [key]: "inside" }, async () => {
        expect(process.env[key]).toBe("inside");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(process.env[key]).toBe(prev);
  });

  it("withEnvAsync applies values only inside async callback", async () => {
    const key = "OPENCLAW_ENV_TEST_ASYNC_OK";
    const prev = process.env[key];

    const seen = await withEnvAsync({ [key]: "inside" }, async () => process.env[key]);

    expect(seen).toBe("inside");
    expect(process.env[key]).toBe(prev);
  });

  it("withEnvAsync can delete a key only inside callback", async () => {
    const key = "OPENCLAW_ENV_TEST_ASYNC_DELETE";
    const prev = process.env[key];
    process.env[key] = "outer";

    const seen = await withEnvAsync({ [key]: undefined }, async () => process.env[key]);

    expect(seen).toBeUndefined();
    expect(process.env[key]).toBe("outer");
    restoreEnvKey(key, prev);
  });

  it("createPathResolutionEnv clears leaked path overrides before applying explicit ones", () => {
    const homeDir = path.join(path.sep, "tmp", "openclaw-home");
    const resolvedHomeDir = path.resolve(homeDir);
    const previousOpenClawHome = process.env.OPENCLAW_HOME;
    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    const previousBundledDir = process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;
    process.env.OPENCLAW_HOME = "/srv/openclaw-home";
    process.env.OPENCLAW_STATE_DIR = "/srv/openclaw-state";
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = "/srv/openclaw-bundled";

    try {
      const env = createPathResolutionEnv(homeDir, {
        OPENCLAW_STATE_DIR: "~/state",
      });

      expect(env.HOME).toBe(resolvedHomeDir);
      expect(env.OPENCLAW_HOME).toBeUndefined();
      expect(env.OPENCLAW_BUNDLED_PLUGINS_DIR).toBeUndefined();
      expect(env.OPENCLAW_STATE_DIR).toBe("~/state");
    } finally {
      restoreEnvKey("OPENCLAW_HOME", previousOpenClawHome);
      restoreEnvKey("OPENCLAW_STATE_DIR", previousStateDir);
      restoreEnvKey("OPENCLAW_BUNDLED_PLUGINS_DIR", previousBundledDir);
    }
  });

  it("withPathResolutionEnv only applies the explicit path env inside the callback", () => {
    const homeDir = path.join(path.sep, "tmp", "openclaw-home");
    const resolvedHomeDir = path.resolve(homeDir);
    const previousOpenClawHome = process.env.OPENCLAW_HOME;
    process.env.OPENCLAW_HOME = "/srv/openclaw-home";

    try {
      const seen = withPathResolutionEnv(
        homeDir,
        { OPENCLAW_BUNDLED_PLUGINS_DIR: "~/bundled" },
        (env) => ({
          processHome: process.env.HOME,
          processOpenClawHome: process.env.OPENCLAW_HOME,
          processBundledDir: process.env.OPENCLAW_BUNDLED_PLUGINS_DIR,
          envBundledDir: env.OPENCLAW_BUNDLED_PLUGINS_DIR,
        }),
      );

      expect(seen).toEqual({
        processHome: resolvedHomeDir,
        processOpenClawHome: undefined,
        processBundledDir: "~/bundled",
        envBundledDir: "~/bundled",
      });
      expect(process.env.OPENCLAW_HOME).toBe("/srv/openclaw-home");
    } finally {
      restoreEnvKey("OPENCLAW_HOME", previousOpenClawHome);
    }
  });

  it("listOpenclawEnvKeys returns only OPENCLAW_-prefixed keys present in env", () => {
    const key = "OPENCLAW_ENV_TEST_LIST_KEY";
    const noise = "NOT_AN_OPENCLAW_ENV_TEST";
    const prevKey = process.env[key];
    const prevNoise = process.env[noise];
    process.env[key] = "set";
    process.env[noise] = "set";

    try {
      const keys = listOpenclawEnvKeys();
      expect(keys).toContain(key);
      expect(keys).not.toContain(noise);
      for (const k of keys) {
        expect(k.startsWith("OPENCLAW_")).toBe(true);
      }
    } finally {
      restoreEnvKey(key, prevKey);
      restoreEnvKey(noise, prevNoise);
    }
  });

  it("captureHermeticOpenclawEnv clears all OPENCLAW_* keys and restores them", () => {
    const keyA = "OPENCLAW_ENV_TEST_HERMETIC_A";
    const keyB = "OPENCLAW_ENV_TEST_HERMETIC_B";
    const noise = "NOT_OPENCLAW_HERMETIC";
    const prevA = process.env[keyA];
    const prevB = process.env[keyB];
    const prevNoise = process.env[noise];
    process.env[keyA] = "a";
    process.env[keyB] = "b";
    process.env[noise] = "untouched";

    try {
      const snapshot = captureHermeticOpenclawEnv();
      expect(process.env[keyA]).toBeUndefined();
      expect(process.env[keyB]).toBeUndefined();
      expect(process.env[noise]).toBe("untouched");
      snapshot.restore();
      expect(process.env[keyA]).toBe("a");
      expect(process.env[keyB]).toBe("b");
      expect(process.env[noise]).toBe("untouched");
    } finally {
      restoreEnvKey(keyA, prevA);
      restoreEnvKey(keyB, prevB);
      restoreEnvKey(noise, prevNoise);
    }
  });

  it("captureHermeticOpenclawEnv discovers keys set by seat-divergent systemd-unit injections", () => {
    // Simulates the cohort-FEC scenario from cael-seat: a seat exports an
    // OPENCLAW_* var that lamp-NUC + silas-seat don't (e.g.
    // OPENCLAW_ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS, caught by cael on PR #844).
    // The hermetic helper must discover-and-clear it without enumeration.
    const seatSpecificKey = "OPENCLAW_ENV_TEST_SEAT_SPECIFIC_SIM";
    const prev = process.env[seatSpecificKey];
    process.env[seatSpecificKey] = "seat-specific-value";

    try {
      const snapshot = captureHermeticOpenclawEnv();
      expect(process.env[seatSpecificKey]).toBeUndefined();
      snapshot.restore();
      expect(process.env[seatSpecificKey]).toBe("seat-specific-value");
    } finally {
      restoreEnvKey(seatSpecificKey, prev);
    }
  });

  it("withHermeticOpenclawEnv strips OPENCLAW_* only inside callback and restores after", () => {
    const key = "OPENCLAW_ENV_TEST_WITH_HERMETIC";
    const prev = process.env[key];
    process.env[key] = "outside";

    try {
      const seen = withHermeticOpenclawEnv(() => process.env[key]);
      expect(seen).toBeUndefined();
      expect(process.env[key]).toBe("outside");
    } finally {
      restoreEnvKey(key, prev);
    }
  });

  it("withHermeticOpenclawEnv restores keys when callback throws", () => {
    const key = "OPENCLAW_ENV_TEST_WITH_HERMETIC_THROW";
    const prev = process.env[key];
    process.env[key] = "outside";

    try {
      expect(() =>
        withHermeticOpenclawEnv(() => {
          expect(process.env[key]).toBeUndefined();
          throw new Error("boom");
        }),
      ).toThrow("boom");
      expect(process.env[key]).toBe("outside");
    } finally {
      restoreEnvKey(key, prev);
    }
  });

  it("withHermeticOpenclawEnvAsync restores keys when async callback throws", async () => {
    const key = "OPENCLAW_ENV_TEST_WITH_HERMETIC_ASYNC_THROW";
    const prev = process.env[key];
    process.env[key] = "outside";

    try {
      await expect(
        withHermeticOpenclawEnvAsync(async () => {
          expect(process.env[key]).toBeUndefined();
          throw new Error("async-boom");
        }),
      ).rejects.toThrow("async-boom");
      expect(process.env[key]).toBe("outside");
    } finally {
      restoreEnvKey(key, prev);
    }
  });

  it("withHermeticOpenclawEnvAsync clears OPENCLAW_* only inside async callback", async () => {
    const key = "OPENCLAW_ENV_TEST_WITH_HERMETIC_ASYNC_OK";
    const prev = process.env[key];
    process.env[key] = "outside";

    try {
      const seen = await withHermeticOpenclawEnvAsync(async () => process.env[key]);
      expect(seen).toBeUndefined();
      expect(process.env[key]).toBe("outside");
    } finally {
      restoreEnvKey(key, prev);
    }
  });
});
