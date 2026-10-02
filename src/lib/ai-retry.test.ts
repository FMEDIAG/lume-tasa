import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { AiProviderError, withAiRetries } from "./ai-retry.ts";

describe("AI retries", () => {
  it("retries transient provider errors within the supplied time budget", async () => {
    let attempts = 0;
    const budgets: number[] = [];
    const result = await withAiRetries(3_000, async (attemptTimeoutMs) => {
      attempts++;
      budgets.push(attemptTimeoutMs);
      if (attempts < 3) throw new AiProviderError("temporary provider failure", true, 503);
      return "valid result";
    });

    assert.equal(result, "valid result");
    assert.equal(attempts, 3);
    assert.ok(budgets.every((budget) => budget > 0));
    assert.ok(budgets[0] + 600 <= 3_000);
  });

  it("retries malformed output at most twice after the initial attempt", async () => {
    let attempts = 0;
    await assert.rejects(
      withAiRetries(3_000, async () => {
        attempts++;
        throw new SyntaxError("invalid model JSON");
      }),
      /invalid model JSON/,
    );
    assert.equal(attempts, 3);
  });

  it("retries schema-invalid model output", async () => {
    const schema = z.object({ value: z.string() });
    let attempts = 0;
    await assert.rejects(
      withAiRetries(3_000, async () => {
        attempts++;
        return schema.parse({ value: 42 });
      }),
      /Expected string/,
    );
    assert.equal(attempts, 3);
  });

  it("does not retry authentication, quota, or rate-limit errors", async () => {
    for (const status of [401, 402, 403, 429]) {
      let attempts = 0;
      await assert.rejects(
        withAiRetries(3_000, async () => {
          attempts++;
          throw new AiProviderError(`provider ${status}`, false, status);
        }),
        new RegExp(`provider ${status}`),
      );
      assert.equal(attempts, 1);
    }
  });

  it("does not retry other non-retryable failures", async () => {
    let attempts = 0;
    await assert.rejects(
      withAiRetries(3_000, async () => {
        attempts++;
        throw new Error("invalid request");
      }),
      /invalid request/,
    );
    assert.equal(attempts, 1);
  });
});
