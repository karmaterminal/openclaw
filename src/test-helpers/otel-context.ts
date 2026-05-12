import { AsyncLocalStorage } from "node:async_hooks";
import { context as otelContext, ROOT_CONTEXT, trace as otelTrace } from "@opentelemetry/api";
import type { Context, ContextManager, Span, SpanContext } from "@opentelemetry/api";

class TestOtelContextManager implements ContextManager {
  private readonly storage = new AsyncLocalStorage<Context>();

  active(): Context {
    return this.storage.getStore() ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this.storage.run(context, () => fn.apply(thisArg, args));
  }

  bind<T>(context: Context, target: T): T {
    if (typeof target !== "function") {
      return target;
    }
    const bound = (...args: unknown[]) =>
      this.with(context, () => (target as (...args: unknown[]) => unknown)(...args));
    return bound as T;
  }

  enable(): this {
    return this;
  }

  disable(): this {
    this.storage.disable();
    return this;
  }
}

class TestSpan implements Span {
  constructor(private readonly context: SpanContext) {}

  spanContext(): SpanContext {
    return this.context;
  }

  setAttribute(): this {
    return this;
  }

  setAttributes(): this {
    return this;
  }

  addEvent(): this {
    return this;
  }

  addLink(): this {
    return this;
  }

  addLinks(): this {
    return this;
  }

  setStatus(): this {
    return this;
  }

  updateName(): this {
    return this;
  }

  end(): void {
    return undefined;
  }

  isRecording(): boolean {
    return true;
  }

  recordException(): void {
    return undefined;
  }
}

export function installTestOtelContextManager(): () => void {
  otelContext.disable();
  const manager = new TestOtelContextManager();
  if (!otelContext.setGlobalContextManager(manager.enable())) {
    throw new Error("failed to install test OpenTelemetry context manager");
  }
  return () => {
    manager.disable();
    otelContext.disable();
  };
}

export function runWithTestActiveSpan<T>(spanContext: SpanContext, callback: () => T): T {
  return otelContext.with(
    otelTrace.setSpan(otelContext.active(), new TestSpan(spanContext)),
    callback,
  );
}
