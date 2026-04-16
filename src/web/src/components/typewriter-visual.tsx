"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

// Key layout: 3 rows of oval keys (front-facing view)
const KEY_ROWS = [9, 7, 9];

// Mock emails from Jarvis
const EMAILS = [
  {
    from: "jarvis@alook.ai",
    to: "you@company.com",
    subject: "Re: Deploy the hotfix to staging",
    body: "Done. Pulled feat/fix-session-token, all 47 tests passing. Deployed to staging \u2014 verified the login flow manually. It\u2019s live now.",
  },
  {
    from: "jarvis@alook.ai",
    to: "you@company.com",
    subject: "Re: Check API health",
    body: "All endpoints responding. p99 latency at 42ms, error rate 0.01%. The alerting threshold is 200ms so we\u2019re well within range.",
  },
  {
    from: "jarvis@alook.ai",
    to: "you@company.com",
    subject: "Re: Summarize today\u2019s PRs",
    body: "3 PRs merged: auth token rotation (#412), rate limiter fix (#415), dashboard chart update (#418). One open review from Sarah on #420.",
  },
  {
    from: "jarvis@alook.ai",
    to: "design@company.com",
    subject: "Re: Update the landing page copy",
    body: "Replaced the hero tagline and updated the feature descriptions. Pushed to feat/landing-copy. Preview link is live \u2014 check staging.",
  },
  {
    from: "jarvis@alook.ai",
    to: "you@company.com",
    subject: "Re: Run the test suite",
    body: "Full suite passed: 847 tests, 0 failures. Coverage at 84.2%, up from 83.1% last run. No flaky tests detected this time.",
  },
];

// CSS variables the typewriter CSS needs — self-provided so
// the component works outside the `.landing` scope too.
const TW_VARS: React.CSSProperties = {
  "--tw-body": "oklch(0.25 0.01 60)",
  "--tw-body-hi": "oklch(0.30 0.01 60)",
  "--tw-body-lo": "oklch(0.18 0.01 55)",
  "--tw-body-top": "oklch(0.28 0.01 60)",
  "--tw-chrome": "oklch(0.72 0.01 75)",
  "--tw-chrome-hi": "oklch(0.82 0.005 80)",
  "--tw-paper": "oklch(0.97 0.008 80)",
  "--tw-blob": "oklch(0.88 0.025 82)",
  "--tw-roller": "oklch(0.15 0.01 55)",
} as React.CSSProperties;

interface TypewriterVisualProps {
  className?: string;
  /** When true, keyboard Enter cycles emails. Default false. */
  interactive?: boolean;
  /** Delay (seconds) before the paper-feed entrance animation starts. */
  entranceDelay?: number;
  /** Custom paper content. When provided, replaces the default email carousel and disables cycling. */
  paper?: React.ReactNode;
}

/**
 * Full 3D typewriter with paper-feed animation, email cycling, and mouse parallax.
 * `interactive` controls whether keyboard Enter triggers email cycling —
 * only the homepage should set this to true.
 */
export function TypewriterVisual({
  className,
  interactive = false,
  entranceDelay = 0.3,
  paper,
}: TypewriterVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paperTlRef = useRef<gsap.core.Timeline | null>(null);
  const isAnimatingRef = useRef(false);
  const [emailIndex, setEmailIndex] = useState(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const scene = el.querySelector<HTMLElement>(".typewriter-scene");
      if (!scene) return;
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const ny = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      scene.style.transition = "transform 0.12s ease-out";
      scene.style.transform = `rotateY(${-20 + nx * 15}deg) rotateX(${10 + ny * -10}deg)`;
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scene = el.querySelector<HTMLElement>(".typewriter-scene");
    if (!scene) return;
    scene.style.transition = "transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)";
    scene.style.transform = "";
  }, []);

  // Play the paper feed animation — paper slides up, text types in
  const playPaperFeed = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;

    if (paperTlRef.current) {
      paperTlRef.current.kill();
    }

    const bodyEl = root.querySelector(".tw-email-body");
    if (!bodyEl) return;
    const bodySplit = SplitText.create(bodyEl, { type: "words" });

    const paper = root.querySelector<HTMLElement>(".tw-paper");
    const paperH = paper ? paper.offsetHeight : 300;
    gsap.set(paper, { y: paperH, opacity: 1 });
    gsap.set(root.querySelectorAll(".tw-email-line"), { opacity: 0 });
    gsap.set(bodySplit.words, { opacity: 0 });

    const tl = gsap.timeline({
      onComplete: () => {
        isAnimatingRef.current = false;
      },
    });

    tl.to(paper, {
      y: 0,
      duration: 3,
      ease: "power1.out",
    })
      .to(root.querySelectorAll(".tw-email-line"), {
        opacity: 1,
        duration: 0.15,
        stagger: 0.3,
        ease: "none",
      }, "<+=0.3")
      .to(bodySplit.words, {
        opacity: 1,
        duration: 0.01,
        stagger: 0.06,
        ease: "none",
      }, "<+=0.5");

    paperTlRef.current = tl;
  }, []);

  const handleReturnKey = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    const root = containerRef.current;
    if (!root) return;

    if (paperTlRef.current) {
      paperTlRef.current.kill();
    }

    const paper = root.querySelector<HTMLElement>(".tw-paper");
    const paperH = paper ? paper.offsetHeight : 300;
    gsap.to(paper, {
      y: paperH,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => {
        setEmailIndex((prev) => {
          const next = (prev + 1) % EMAILS.length;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              playPaperFeed();
            });
          });
          return next;
        });
      },
    });
  }, [playPaperFeed]);

  // Keyboard Enter listener — only when interactive
  useEffect(() => {
    if (!interactive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleReturnKey();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [interactive, handleReturnKey]);

  // Entrance animation — paper feeds in on mount
  useGSAP(
    () => {
      const root = containerRef.current;
      if (!root) return;

      const bodyEl = root.querySelector(".tw-email-body");
      if (!bodyEl) return;
      const bodySplit = SplitText.create(bodyEl, { type: "words" });

      const paper = root.querySelector<HTMLElement>(".tw-paper");
      const paperH = paper ? paper.offsetHeight : 300;
      gsap.set(paper, { y: paperH, opacity: 1 });
      gsap.set(root.querySelectorAll(".tw-email-line"), { opacity: 0 });
      gsap.set(bodySplit.words, { opacity: 0 });

      const tl = gsap.timeline({ delay: entranceDelay });

      tl.to(paper, {
        y: 0,
        duration: 3,
        ease: "power1.out",
      })
        .to(root.querySelectorAll(".tw-email-line"), {
          opacity: 1,
          duration: 0.15,
          stagger: 0.3,
          ease: "none",
        }, "<+=0.3")
        .to(bodySplit.words, {
          opacity: 1,
          duration: 0.01,
          stagger: 0.06,
          ease: "none",
        }, "<+=0.5");

      paperTlRef.current = tl;
    },
    { scope: containerRef }
  );

  const email = EMAILS[emailIndex];

  return (
    <div
      ref={containerRef}
      className={`typewriter-visual${className ? ` ${className}` : ""}`}
      style={TW_VARS}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="typewriter-blob" />

      <div className="typewriter-scene">
        <div className="tw-machine">
          <div className="tw-body">
            <div className="tw-body-back" />
            <div className="tw-body-left" />
            <div className="tw-body-right" />
            <div className="tw-body-top" />
            <div className="tw-body-bottom" />

            <div className="tw-body-front">
              {/* Paper track — clips paper as it feeds out */}
              <div className="tw-paper-track">
                <div className="tw-paper" key={paper ? "custom" : emailIndex}>
                  {paper ?? (
                    <>
                      <div
                        className="tw-email-headers"
                        style={{
                          fontFamily: "var(--font-crt)",
                          fontSize: "15px",
                          color: "var(--landing-text-muted)",
                          lineHeight: 1.7,
                          borderBottom: "1px solid oklch(0.15 0.01 55 / 10%)",
                          paddingBottom: "10px",
                          marginBottom: "12px",
                        }}
                      >
                        <div className="tw-email-line">
                          <span style={{ color: "var(--landing-text)" }}>From:</span>{" "}
                          {email.from}
                        </div>
                        <div className="tw-email-line">
                          <span style={{ color: "var(--landing-text)" }}>To:</span>{" "}
                          {email.to}
                        </div>
                        <div className="tw-email-line">
                          <span style={{ color: "var(--landing-text)" }}>Subject:</span>{" "}
                          {email.subject}
                        </div>
                      </div>

                      <div
                        className="tw-email-body"
                        style={{
                          fontFamily: "var(--font-crt)",
                          color: "var(--landing-text)",
                          fontSize: "17px",
                          lineHeight: 1.6,
                        }}
                      >
                        {email.body}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Roller with knobs */}
              <div className="tw-roller-assembly">
                <div className="tw-knob tw-knob-left" />
                <div className="tw-roller" />
                <div className="tw-knob tw-knob-right" />
              </div>

              {/* Type-bar fan */}
              <div className="tw-typebar-fan" />

              {/* Key rows + return key */}
              <div className="tw-keys-layer">
                {KEY_ROWS.map((count, ri) => (
                  <div key={ri} className="tw-key-row">
                    {Array.from({ length: count }).map((_, ki) => (
                      <div key={ki} className="tw-key" />
                    ))}
                    {ri === 1 && !paper && (
                      <button
                        className="tw-key tw-return-key"
                        onClick={handleReturnKey}
                        aria-label="Return — load next email"
                      >
                        <span className="tw-return-label">{"\u21B5"}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Bars */}
              <div className="tw-bars">
                <div className="tw-bar tw-bar-long" />
                <div className="tw-bar tw-bar-short" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
