"use client";

import { Fragment, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ArchNode {
  label: string;
  lines: string[];
}

const columns: { title: string; spec: string; nodes: ArchNode[] }[] = [
  {
    title: "Runtime Machine",
    spec: "RUNTIME: BUN / AI: CLAUDE, CODEX",
    nodes: [
      {
        label: "CLI Daemon",
        lines: ["Heartbeat 15s · Poll 3s", "Task execution pipeline"],
      },
      {
        label: "Agent Runtimes",
        lines: ["claude@1.0.0 — active", "codex@1.0.0 — standby"],
      },
    ],
  },
  {
    title: "Cloudflare Edge",
    spec: "WORKERS / D1 / R2 / DURABLE OBJECTS",
    nodes: [
      {
        label: "Email Worker",
        lines: ["SMTP → parse → R2/D1", "service binding → Web"],
      },
      {
        label: "Web Service",
        lines: ["Next.js on Workers", "REST API · Auth · D1 r/w"],
      },
      {
        label: "WS-DO",
        lines: ["Durable Objects", "WebSocket per agent/user"],
      },
    ],
  },
  {
    title: "Clients",
    spec: "SMTP INBOUND / BROWSER DASHBOARD",
    nodes: [
      {
        label: "Inbound Email",
        lines: ["team@co.com →", "jarvis@alook.ai"],
      },
      {
        label: "Dashboard",
        lines: ["Real-time via WebSocket", "Monitor · Review · Stream"],
      },
    ],
  },
];

export function ArchitectureOverview() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(".arch-title", {
        y: 30,
        opacity: 0,
        duration: 0.6,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 75%",
          toggleActions: "play none none none",
        },
      });

      gsap.from(".arch-column", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        stagger: 0.15,
        scrollTrigger: {
          trigger: ".arch-grid",
          start: "top 70%",
          toggleActions: "play none none none",
        },
      });

      gsap.from(".arch-connector", {
        scaleX: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".arch-grid",
          start: "top 60%",
          toggleActions: "play none none none",
        },
      });
    },
    { scope: sectionRef }
  );

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-screen flex-col items-center justify-center px-6 py-32"
      style={{ backgroundColor: "var(--landing-bg)" }}
    >
      {/* Section title */}
      <div className="arch-title mb-16 text-center">
        <div
          className="mb-3 text-xs uppercase tracking-[0.3em]"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--landing-text-muted)",
          }}
        >
          How It Works
        </div>
        <h2
          style={{
            fontFamily: "var(--font-crt)",
            color: "var(--landing-text)",
            fontSize: "clamp(1.75rem, 4vw, 3rem)",
          }}
        >
          The Architecture
        </h2>
        <p
          className="mt-2 max-w-lg mx-auto"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--landing-text-muted)",
            fontSize: "0.85rem",
          }}
        >
          Email in → Edge parses & stores → Daemon polls & executes →
          Results stream back in real time.
        </p>
      </div>

      {/* Architecture grid */}
      <div className="arch-grid mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {columns.map((col, colIndex) => (
          <Fragment key={col.title}>
            <div className="arch-column">
              {/* Column header */}
              <div className="mb-4 text-center">
                <h3
                  className="text-lg"
                  style={{
                    fontFamily: "var(--font-crt)",
                    color: "var(--landing-text)",
                  }}
                >
                  {col.title}
                </h3>
                <div
                  className="mt-1 text-[9px] uppercase tracking-[0.2em]"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--landing-text-muted)",
                  }}
                >
                  {col.spec}
                </div>
              </div>

              {/* Nodes */}
              <div className="space-y-3">
                {col.nodes.map((node) => (
                  <div
                    key={node.label}
                    className="rounded-lg p-1.5"
                    style={{
                      backgroundColor: "oklch(0.82 0.02 75)",
                      boxShadow:
                        "0 2px 8px oklch(0.15 0.01 55 / 10%), inset 0 1px 0 oklch(0.95 0.01 80 / 40%)",
                    }}
                  >
                    <div
                      className="relative overflow-hidden rounded px-4 py-3"
                      style={{
                        backgroundColor: "var(--landing-crt-bg)",
                        boxShadow: "inset 0 0 20px oklch(0.04 0.003 55)",
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
                          className="mb-1.5 text-[10px] uppercase tracking-[0.15em]"
                          style={{
                            fontFamily: "var(--font-crt)",
                            color: "var(--landing-phosphor)",
                            opacity: 0.5,
                            textShadow:
                              "0 0 6px oklch(0.75 0.18 80 / 30%)",
                          }}
                        >
                          {node.label}
                        </div>
                        {node.lines.map((line, i) => (
                          <div
                            key={i}
                            className="text-xs leading-relaxed"
                            style={{
                              fontFamily: "var(--font-crt)",
                              color: "var(--landing-phosphor)",
                              textShadow:
                                "0 0 6px oklch(0.75 0.18 80 / 30%)",
                              opacity: 0.75,
                            }}
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connector between columns (desktop only) */}
            {colIndex < columns.length - 1 && (
              <div
                className="arch-connector hidden lg:flex items-center justify-center self-center"
              >
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="h-px w-12 origin-left"
                    style={{
                      backgroundColor: "var(--landing-text-muted)",
                      opacity: 0.3,
                    }}
                  />
                  <span
                    className="text-[10px]"
                    style={{
                      fontFamily: "var(--font-crt)",
                      color: "var(--landing-text-muted)",
                      opacity: 0.4,
                    }}
                  >
                    {colIndex === 0 ? "HTTP POLL" : "SMTP / WSS"}
                  </span>
                  <div
                    className="h-px w-12 origin-left"
                    style={{
                      backgroundColor: "var(--landing-text-muted)",
                      opacity: 0.3,
                    }}
                  />
                </div>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </section>
  );
}
