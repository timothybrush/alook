"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface EmailOption {
  subject: string;
  body: string;
  reply: string;
}

const emailOptions: EmailOption[] = [
  {
    subject: "Check if my API is still up",
    body: "Hey Jarvis, can you hit all the health endpoints and let me know if anything looks off?",
    reply:
      "All 4 endpoints responding. Average latency 42ms. The /users endpoint is slightly slower than usual (180ms vs 90ms baseline) — might want to look into that.",
  },
  {
    subject: "Summarize today's GitHub notifications",
    body: "What happened on our repos today?",
    reply:
      "3 PRs merged (auth refactor, email worker fix, CLI update). 2 new issues opened — one P1 about WebSocket disconnects. You were tagged in a review on the email worker PR.",
  },
  {
    subject: "Deploy the latest build to staging",
    body: "Ship the current main to staging when you get a chance.",
    reply:
      "Done. Build #847 deployed to staging at 14:32 UTC. All smoke tests passing. No new errors in the first 5 minutes of logs.",
  },
];

export function EmailDemo() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeEmail, setActiveEmail] = useState<number | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "sending" | "processing" | "replying" | "done"
  >("idle");
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInteracted = useRef(false);

  useGSAP(
    () => {
      gsap.from(".email-section-title", {
        y: 30,
        opacity: 0,
        duration: 0.6,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 75%",
          toggleActions: "play none none none",
        },
      });

      gsap.from(".email-panel", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        stagger: 0.15,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 65%",
          toggleActions: "play none none none",
        },
      });
    },
    { scope: sectionRef }
  );

  const handleSendEmail = useCallback(
    (index: number) => {
      if (phase !== "idle" && phase !== "done") return;
      hasInteracted.current = true;
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);

      setActiveEmail(index);
      setPhase("sending");

      const tl = gsap.timeline();
      tl.to({}, { duration: 0.3 });
      tl.call(() => setPhase("processing"));
      tl.to({}, { duration: 1.8 });
      tl.call(() => setPhase("replying"));
      tl.to({}, { duration: 0.5 });
      tl.call(() => setPhase("done"));
      tl.from(".email-reply-block", {
        y: 8,
        opacity: 0,
        duration: 0.3,
        ease: "power2.out",
      });
    },
    [phase]
  );

  const handleSendEmailRef = useRef(handleSendEmail);
  useEffect(() => {
    handleSendEmailRef.current = handleSendEmail;
  }, [handleSendEmail]);

  useEffect(() => {
    if (hasInteracted.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasInteracted.current) {
          autoPlayTimerRef.current = setTimeout(() => {
            if (!hasInteracted.current) handleSendEmailRef.current(0);
          }, 3000);
        } else if (autoPlayTimerRef.current) {
          clearTimeout(autoPlayTimerRef.current);
        }
      },
      { threshold: 0.5 }
    );
    const section = sectionRef.current;
    if (section) observer.observe(section);
    return () => {
      if (section) observer.unobserve(section);
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, []);

  const email = activeEmail !== null ? emailOptions[activeEmail] : null;

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-screen flex-col items-center justify-center px-6 py-32"
      style={{ backgroundColor: "var(--landing-bg)" }}
    >
      {/* Section title */}
      <div className="email-section-title mb-12 text-center">
        <div
          className="mb-3 text-xs uppercase tracking-[0.3em]"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--landing-text-muted)",
          }}
        >
          Demonstration
        </div>
        <h2
          style={{
            fontFamily: "var(--font-crt)",
            color: "var(--landing-text)",
            fontSize: "clamp(1.75rem, 4vw, 3rem)",
          }}
        >
          The Email Interface
        </h2>
        <p
          className="mt-2"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--landing-text-muted)",
            fontSize: "0.85rem",
          }}
        >
          Select a message. Observe the agent process and respond.
        </p>
      </div>

      {/* Two CRT panels side by side */}
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Left: Outbox terminal */}
        <div
          className="email-panel rounded-lg p-2"
          style={{
            backgroundColor: "oklch(0.82 0.02 75)",
            boxShadow:
              "0 4px 16px oklch(0.15 0.01 55 / 15%), inset 0 1px 0 oklch(0.95 0.01 80 / 40%)",
          }}
        >
          <div
            className="relative overflow-hidden rounded p-5"
            style={{
              backgroundColor: "var(--landing-crt-bg)",
              boxShadow: "inset 0 0 40px oklch(0.04 0.003 55)",
              minHeight: "320px",
            }}
          >
            {/* Scan lines */}
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, transparent 0px, transparent 1px, oklch(0 0 0 / 6%) 1px, oklch(0 0 0 / 6%) 2px)",
                backgroundSize: "100% 2px",
              }}
            />

            <div className="relative z-20">
              <div
                className="mb-4 text-xs uppercase tracking-[0.2em]"
                style={{
                  fontFamily: "var(--font-crt)",
                  color: "var(--landing-phosphor)",
                  opacity: 0.5,
                  textShadow: "0 0 6px oklch(0.75 0.18 80 / 30%)",
                }}
              >
                OUTBOX &mdash; TO: jarvis@alook.ai
              </div>

              {/* Email options */}
              <div className="space-y-2">
                {emailOptions.map((opt, i) => (
                  <button
                    key={opt.subject}
                    onClick={() => handleSendEmail(i)}
                    disabled={phase !== "idle" && phase !== "done"}
                    className="block w-full text-left transition-opacity duration-150"
                    style={{
                      fontFamily: "var(--font-crt)",
                      color: "var(--landing-phosphor)",
                      fontSize: "0.9rem",
                      opacity:
                        activeEmail === i
                          ? 1
                          : phase !== "idle" && phase !== "done"
                            ? 0.3
                            : 0.6,
                      textShadow:
                        activeEmail === i
                          ? "0 0 10px oklch(0.75 0.18 80 / 50%)"
                          : "0 0 4px oklch(0.75 0.18 80 / 20%)",
                      cursor:
                        phase !== "idle" && phase !== "done"
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {activeEmail === i ? "▶ " : "  "}
                    {opt.subject}
                  </button>
                ))}
              </div>

              {/* Reply display */}
              {phase === "done" && email && (
                <div className="email-reply-block mt-5">
                  <div
                    className="mb-1 text-xs uppercase tracking-[0.15em]"
                    style={{
                      fontFamily: "var(--font-crt)",
                      color: "var(--landing-phosphor)",
                      opacity: 0.4,
                      textShadow: "0 0 4px oklch(0.75 0.18 80 / 20%)",
                    }}
                  >
                    REPLY FROM jarvis@alook.ai:
                  </div>
                  <p
                    className="leading-relaxed"
                    style={{
                      fontFamily: "var(--font-crt)",
                      color: "var(--landing-phosphor)",
                      fontSize: "0.85rem",
                      opacity: 0.75,
                      textShadow: "0 0 6px oklch(0.75 0.18 80 / 30%)",
                    }}
                  >
                    {email.reply}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-1 px-2">
            <span
              className="text-[10px] uppercase tracking-[0.2em]"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--landing-text-muted)",
              }}
            >
              Terminal A — Compose
            </span>
          </div>
        </div>

        {/* Right: Agent log terminal */}
        <div
          className="email-panel rounded-lg p-2"
          style={{
            backgroundColor: "oklch(0.82 0.02 75)",
            boxShadow:
              "0 4px 16px oklch(0.15 0.01 55 / 15%), inset 0 1px 0 oklch(0.95 0.01 80 / 40%)",
          }}
        >
          <div
            className="relative overflow-hidden rounded p-5"
            style={{
              backgroundColor: "var(--landing-crt-bg)",
              boxShadow: "inset 0 0 40px oklch(0.04 0.003 55)",
              minHeight: "320px",
            }}
          >
            {/* Scan lines */}
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, transparent 0px, transparent 1px, oklch(0 0 0 / 6%) 1px, oklch(0 0 0 / 6%) 2px)",
                backgroundSize: "100% 2px",
              }}
            />

            <div className="relative z-20">
              <div
                className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em]"
                style={{
                  fontFamily: "var(--font-crt)",
                  color: "var(--landing-phosphor)",
                  opacity: 0.5,
                  textShadow: "0 0 6px oklch(0.75 0.18 80 / 30%)",
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: "var(--landing-phosphor)",
                    boxShadow: "0 0 6px oklch(0.75 0.18 80 / 60%)",
                  }}
                />
                AGENT: jarvis — STATUS: ONLINE
              </div>

              <div
                className="space-y-1.5"
                style={{
                  fontFamily: "var(--font-crt)",
                  color: "var(--landing-phosphor)",
                  fontSize: "0.85rem",
                  textShadow: "0 0 6px oklch(0.75 0.18 80 / 30%)",
                }}
              >
                {phase === "idle" && (
                  <div style={{ opacity: 0.4 }}>
                    [idle] Waiting for incoming mail...
                    <span
                      className="ml-1 inline-block h-3.5 w-1.5 animate-pulse"
                      style={{
                        backgroundColor: "var(--landing-phosphor)",
                        boxShadow: "0 0 6px oklch(0.75 0.18 80 / 40%)",
                      }}
                    />
                  </div>
                )}

                {(phase === "sending" || phase === "processing") && email && (
                  <>
                    <div style={{ opacity: 0.7 }}>
                      [inbox] Message received
                    </div>
                    <div style={{ opacity: 0.5 }}>
                      Subject: {email.subject}
                    </div>
                    {phase === "processing" && (
                      <div style={{ opacity: 0.7 }}>
                        [exec] Processing request...
                      </div>
                    )}
                  </>
                )}

                {phase === "replying" && email && (
                  <>
                    <div style={{ opacity: 0.7 }}>[inbox] Message received</div>
                    <div style={{ opacity: 0.5 }}>Subject: {email.subject}</div>
                    <div style={{ opacity: 0.7 }}>[exec] Processing request...</div>
                    <div style={{ opacity: 0.7 }}>[smtp] Composing reply...</div>
                  </>
                )}

                {phase === "done" && email && (
                  <>
                    <div style={{ opacity: 0.7 }}>[inbox] Message received</div>
                    <div style={{ opacity: 0.5 }}>Subject: {email.subject}</div>
                    <div style={{ opacity: 0.7 }}>[exec] Complete.</div>
                    <div style={{ opacity: 0.9 }}>
                      [smtp] ✓ Reply sent to sender
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-1 px-2">
            <span
              className="text-[10px] uppercase tracking-[0.2em]"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--landing-text-muted)",
              }}
            >
              Terminal B — Agent Log
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
