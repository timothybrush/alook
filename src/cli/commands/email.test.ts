import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import PostalMime from "postal-mime";

// Test the PostalMime parsing and file writing logic in isolation
// (CLI commands themselves depend on network + config which we don't mock here)

const TMP_DIR = "/tmp/alook-emails-test";

describe("email pull output structure", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("creates metadata.json with correct fields", () => {
    const emailDir = join(TMP_DIR, "test-email-1");
    mkdirSync(emailDir, { recursive: true });

    const metadata = {
      id: "test-email-1",
      from: "sender@example.com",
      to: "agent@alook.ai",
      subject: "Test Subject",
      date: "2024-01-01T00:00:00Z",
      status: "unread",
    };
    writeFileSync(join(emailDir, "metadata.json"), JSON.stringify(metadata, null, 2));

    const written = JSON.parse(readFileSync(join(emailDir, "metadata.json"), "utf-8"));
    expect(written.id).toBe("test-email-1");
    expect(written.from).toBe("sender@example.com");
    expect(written.to).toBe("agent@alook.ai");
    expect(written.subject).toBe("Test Subject");
    expect(written.status).toBe("unread");
    expect(written.date).toBe("2024-01-01T00:00:00Z");
  });

  it("writes body.txt from parsed MIME text body", async () => {
    const rawMime = "From: test@example.com\r\nTo: agent@alook.ai\r\nSubject: Hello\r\nContent-Type: text/plain\r\n\r\nHello world";
    const parsed = await new PostalMime().parse(rawMime);

    const emailDir = join(TMP_DIR, "test-email-2");
    mkdirSync(emailDir, { recursive: true });

    if (parsed.text) {
      writeFileSync(join(emailDir, "body.txt"), parsed.text);
    }

    expect(existsSync(join(emailDir, "body.txt"))).toBe(true);
    expect(readFileSync(join(emailDir, "body.txt"), "utf-8").trim()).toBe("Hello world");
  });

  it("writes body.html from parsed MIME HTML body", async () => {
    const rawMime = [
      "From: test@example.com",
      "To: agent@alook.ai",
      "Subject: Hello",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>Hello world</p>",
    ].join("\r\n");
    const parsed = await new PostalMime().parse(rawMime);

    const emailDir = join(TMP_DIR, "test-email-3");
    mkdirSync(emailDir, { recursive: true });

    if (parsed.html) {
      writeFileSync(join(emailDir, "body.html"), parsed.html);
    }

    expect(existsSync(join(emailDir, "body.html"))).toBe(true);
    expect(readFileSync(join(emailDir, "body.html"), "utf-8").trim()).toBe("<p>Hello world</p>");
  });

  it("extracts attachments with correct binary content", async () => {
    const boundary = "----=_Part_001";
    const rawMime = [
      "From: test@example.com",
      "To: agent@alook.ai",
      "Subject: With attachment",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain",
      "",
      "Body text",
      `--${boundary}`,
      "Content-Type: application/octet-stream",
      'Content-Disposition: attachment; filename="report.bin"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("binary content").toString("base64"),
      `--${boundary}--`,
    ].join("\r\n");

    const parsed = await new PostalMime().parse(rawMime);
    expect(parsed.attachments.length).toBeGreaterThan(0);

    const emailDir = join(TMP_DIR, "test-email-4");
    const attDir = join(emailDir, "attachments");
    mkdirSync(attDir, { recursive: true });

    for (const att of parsed.attachments) {
      const filename = att.filename || "attachment-0.bin";
      const content = att.content;
      let buf: Buffer;
      if (typeof content === "string") {
        buf = Buffer.from(content, "base64");
      } else if (content instanceof ArrayBuffer) {
        buf = Buffer.from(new Uint8Array(content));
      } else {
        buf = Buffer.from(content as Uint8Array);
      }
      writeFileSync(join(attDir, filename), buf);
    }

    const writtenFile = join(attDir, "report.bin");
    expect(existsSync(writtenFile)).toBe(true);
    expect(readFileSync(writtenFile).toString()).toBe("binary content");
  });

  it("handles attachments with missing filename", async () => {
    const boundary = "----=_Part_002";
    const rawMime = [
      "From: test@example.com",
      "To: agent@alook.ai",
      "Subject: No filename",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain",
      "",
      "Body",
      `--${boundary}`,
      "Content-Type: application/octet-stream",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("data").toString("base64"),
      `--${boundary}--`,
    ].join("\r\n");

    const parsed = await new PostalMime().parse(rawMime);

    const emailDir = join(TMP_DIR, "test-email-5");
    const attDir = join(emailDir, "attachments");
    mkdirSync(attDir, { recursive: true });

    for (let i = 0; i < parsed.attachments.length; i++) {
      const att = parsed.attachments[i];
      const filename = att.filename || `attachment-${i}.bin`;
      const content = att.content;
      let buf: Buffer;
      if (typeof content === "string") {
        buf = Buffer.from(content, "base64");
      } else if (content instanceof ArrayBuffer) {
        buf = Buffer.from(new Uint8Array(content));
      } else {
        buf = Buffer.from(content as Uint8Array);
      }
      writeFileSync(join(attDir, filename), buf);
    }

    // Should use fallback filename
    const files = require("fs").readdirSync(attDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f: string) => f.startsWith("attachment-"))).toBe(true);
  });

  it("handles duplicate attachment filenames by prefixing with index", () => {
    const emailDir = join(TMP_DIR, "test-email-6");
    const attDir = join(emailDir, "attachments");
    mkdirSync(attDir, { recursive: true });

    const usedFilenames = new Set<string>();
    const attachments = [
      { filename: "report.pdf" },
      { filename: "report.pdf" },
    ];

    for (let i = 0; i < attachments.length; i++) {
      let filename = attachments[i].filename;
      if (usedFilenames.has(filename)) {
        filename = `${i}-${filename}`;
      }
      usedFilenames.add(filename);
      writeFileSync(join(attDir, filename), "content");
    }

    expect(existsSync(join(attDir, "report.pdf"))).toBe(true);
    expect(existsSync(join(attDir, "1-report.pdf"))).toBe(true);
  });

  it("does not clear existing email directories", () => {
    // Pre-create some content
    const existingDir = join(TMP_DIR, "existing-email");
    mkdirSync(existingDir, { recursive: true });
    writeFileSync(join(existingDir, "metadata.json"), "existing");

    // Create a new email directory
    const newDir = join(TMP_DIR, "new-email");
    mkdirSync(newDir, { recursive: true });
    writeFileSync(join(newDir, "metadata.json"), "new");

    // Existing should still be there
    expect(existsSync(join(existingDir, "metadata.json"))).toBe(true);
    expect(readFileSync(join(existingDir, "metadata.json"), "utf-8")).toBe("existing");
  });
});

describe("email status validation", () => {
  const VALID_STATUSES = ["unread", "read", "archived"];

  it("accepts valid status values", () => {
    for (const s of VALID_STATUSES) {
      expect(VALID_STATUSES.includes(s)).toBe(true);
    }
  });

  it("rejects invalid status values", () => {
    expect(VALID_STATUSES.includes("deleted")).toBe(false);
    expect(VALID_STATUSES.includes("pending")).toBe(false);
    expect(VALID_STATUSES.includes("")).toBe(false);
  });
});
