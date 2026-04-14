import { describe, it, expect } from "vitest"
import { POLL_INTERVAL_MS, OFFLINE_THRESHOLD_MS, EVENT_POLL_INTERVAL_MS, AGENT_HANDLE_MIN_LENGTH } from "../src/constants"

describe("constants", () => {
  it("OFFLINE_THRESHOLD_MS is 3x POLL_INTERVAL", () => expect(OFFLINE_THRESHOLD_MS).toBe(POLL_INTERVAL_MS * 3))
  it("AGENT_HANDLE_MIN_LENGTH is 4", () => expect(AGENT_HANDLE_MIN_LENGTH).toBe(4))
  it("EVENT_POLL < POLL_INTERVAL", () => expect(EVENT_POLL_INTERVAL_MS).toBeLessThan(POLL_INTERVAL_MS))
})
