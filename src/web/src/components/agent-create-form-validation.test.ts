import { describe, expect, it } from "vitest";
import {
  hasAgentCreateFieldErrors,
  validateAgentCreateRequiredFields,
} from "./agent-create-form-validation";

describe("validateAgentCreateRequiredFields", () => {
  it("requires a non-empty name", () => {
    const errors = validateAgentCreateRequiredFields({
      name: "   ",
      runtimeId: "rt_1",
    });

    expect(errors).toEqual({ name: "Name is required" });
    expect(hasAgentCreateFieldErrors(errors)).toBe(true);
  });

  it("requires a runtime", () => {
    const errors = validateAgentCreateRequiredFields({
      name: "Maddox",
      runtimeId: "",
    });

    expect(errors).toEqual({ runtimeId: "Select an online runtime" });
    expect(hasAgentCreateFieldErrors(errors)).toBe(true);
  });

  it("passes when required fields are present", () => {
    const errors = validateAgentCreateRequiredFields({
      name: "Maddox",
      runtimeId: "rt_1",
    });

    expect(errors).toEqual({});
    expect(hasAgentCreateFieldErrors(errors)).toBe(false);
  });
});
