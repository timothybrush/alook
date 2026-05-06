import { describe, expect, it } from "vitest";
import {
  hasCustomEmailErrors,
  hasWorkspaceFormErrors,
  validateCustomEmailFields,
  validateWorkspaceForm,
} from "./form-validation";

describe("validateWorkspaceForm", () => {
  it("requires workspace name and slug", () => {
    const errors = validateWorkspaceForm({ name: "   ", slug: "" });

    expect(errors).toEqual({
      name: "Workspace name is required",
      slug: "Workspace slug is required",
    });
    expect(hasWorkspaceFormErrors(errors)).toBe(true);
  });

  it("passes when name and slug are present", () => {
    const errors = validateWorkspaceForm({ name: "Alook", slug: "alook" });

    expect(errors).toEqual({});
    expect(hasWorkspaceFormErrors(errors)).toBe(false);
  });
});

describe("validateCustomEmailFields", () => {
  it("reports specific missing custom email fields", () => {
    const errors = validateCustomEmailFields({
      emailAddress: "",
      imapHost: "",
      imapUsername: "",
      imapPassword: "",
      smtpHost: "",
      smtpUsername: "",
      smtpPassword: "",
    });

    expect(errors).toEqual({
      emailAddress: "Email address is required",
      imapHost: "IMAP host is required",
      imapPassword: "IMAP credentials are required",
      smtpHost: "SMTP host is required",
      smtpPassword: "SMTP credentials are required",
    });
    expect(hasCustomEmailErrors(errors)).toBe(true);
  });

  it("uses defaulted usernames when validating credentials", () => {
    const errors = validateCustomEmailFields({
      emailAddress: "agent@example.com",
      imapHost: "imap.example.com",
      imapUsername: "agent@example.com",
      imapPassword: "secret",
      smtpHost: "smtp.example.com",
      smtpUsername: "agent@example.com",
      smtpPassword: "secret",
    });

    expect(errors).toEqual({});
    expect(hasCustomEmailErrors(errors)).toBe(false);
  });
});
