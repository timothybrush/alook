"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

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

export function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sublineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const paperTlRef = useRef<gsap.core.Timeline | null>(null);
  const isAnimatingRef = useRef(false);
  const [emailIndex, setEmailIndex] = useState(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const el = visualRef.current;
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
    const el = visualRef.current;
    if (!el) return;
    const scene = el.querySelector<HTMLElement>(".typewriter-scene");
    if (!scene) return;
    scene.style.transition = "transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)";
    scene.style.transform = "";
  }, []);

  // Play the paper feed animation — paper slides up, text types in
  const playPaperFeed = useCallback(() => {
    if (paperTlRef.current) {
      paperTlRef.current.kill();
    }

    const bodySplit = SplitText.create(".tw-email-body", { type: "words" });

    // Measure paper height, then push it down behind the roller
    const paper = document.querySelector<HTMLElement>(".tw-paper");
    const paperH = paper ? paper.offsetHeight : 300;
    gsap.set(".tw-paper", { y: paperH, opacity: 1 });
    gsap.set(".tw-email-line", { opacity: 0 });
    gsap.set(bodySplit.words, { opacity: 0 });
    const tl = gsap.timeline({
      onComplete: () => { isAnimatingRef.current = false; },
    });

    // Paper slides up + text types in simultaneously
    tl.to(".tw-paper", {
      y: 0,
      duration: 3,
      ease: "power1.out",
    })
    // Headers type line by line (parallel with paper)
    .to(".tw-email-line", {
      opacity: 1,
      duration: 0.15,
      stagger: 0.3,
      ease: "none",
    }, "<+=0.3")
    // Body words type in (parallel with paper)
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

    // Kill any running paper timeline
    if (paperTlRef.current) {
      paperTlRef.current.kill();
    }

    // Retract paper — slide back down behind roller
    const paper = document.querySelector<HTMLElement>(".tw-paper");
    const paperH = paper ? paper.offsetHeight : 300;
    gsap.to(".tw-paper", {
      y: paperH,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => {
        // Cycle to next email — use functional setState
        setEmailIndex((prev) => {
          const next = (prev + 1) % EMAILS.length;
          // Wait a tick for React to render the new email content, then animate
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

  // Listen for keyboard Enter to trigger the same effect
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault(); // prevent also activating a focused button
        handleReturnKey();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleReturnKey]);

  useGSAP(
    () => {
      if (
        !headingRef.current ||
        !sublineRef.current ||
        !ctaRef.current
      )
        return;

      const sloganSplit = SplitText.create(headingRef.current, {
        type: "words, chars",
      });
      const bodySplit = SplitText.create(".tw-email-body", {
        type: "words",
      });

      // Measure paper height, push it down behind roller, hide text
      const paper = document.querySelector<HTMLElement>(".tw-paper");
      const paperH = paper ? paper.offsetHeight : 300;
      gsap.set(".tw-paper", { y: paperH, opacity: 1 });
      gsap.set(".tw-email-line", { opacity: 0 });
      gsap.set(bodySplit.words, { opacity: 0 });

      const entranceTl = gsap.timeline({ delay: 0.3 });

      entranceTl
        .from(".hero-brand", {
          y: -20,
          opacity: 0,
          duration: 0.5,
          ease: "power3.out",
        })
        .from(
          sloganSplit.chars,
          { opacity: 0, duration: 0.04, stagger: 0.04, ease: "none" },
          0.2
        )
        .from(sublineRef.current, { opacity: 0, duration: 0.03, ease: "none" }, "-=0.1")
        // Paper slides up from roller
        .to(".tw-paper", {
          y: 0,
          duration: 3,
          ease: "power1.out",
        }, "+=0.3")
        // Headers type in (parallel with paper slide)
        .to(".tw-email-line", {
          opacity: 1,
          duration: 0.15,
          stagger: 0.3,
          ease: "none",
        }, "<+=0.3")
        // Body words type in (parallel with paper slide)
        .to(bodySplit.words, {
          opacity: 1,
          duration: 0.01,
          stagger: 0.06,
          ease: "none",
        }, "<+=0.5")
        .from(
          ".hero-specs",
          { y: 15, opacity: 0, duration: 0.5, ease: "power2.out" },
          "-=0.2"
        )
        .from(
          ctaRef.current,
          { y: 15, opacity: 0, duration: 0.4, ease: "power2.out" },
          "-=0.2"
        );

      // Store the paper part of the timeline
      paperTlRef.current = entranceTl;

      // Scroll exit
      const exitTl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=200%",
          pin: true,
          scrub: 1,
          pinSpacing: true,
          snap: {
            snapTo: [0, 1],
            duration: { min: 0.2, max: 0.6 },
            delay: 0.1,
            ease: "power2.inOut",
          },
        },
      });

      exitTl.to(".hero-content", {
        y: -80,
        opacity: 0,
        duration: 1,
        ease: "none",
      });
    },
    { scope: sectionRef }
  );

  const email = EMAILS[emailIndex];

  return (
    <section
      ref={sectionRef}
      className="hero-section relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ backgroundColor: "var(--landing-bg)" }}
    >
      {/* Paper noise */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />

      <div className="hero-content relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6">
        {/* Brand */}
        <div className="hero-brand mb-6 flex items-center gap-3">
          <Image src="/alook.svg" alt="Alook" width={28} height={28} />
          <span
            className="text-xl tracking-tight"
            style={{
              fontFamily: "var(--font-brand)",
              color: "var(--landing-text)",
              fontWeight: 700,
            }}
          >
            Alook
          </span>
          <span
            className="ml-2 text-xs tracking-widest uppercase"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--landing-text-muted)",
            }}
          >
            Personal Computing Division
          </span>
        </div>

        {/* Front-Facing Typewriter */}
        <div
          ref={visualRef}
          className="typewriter-visual relative w-full"
          style={{ height: 570 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div className="typewriter-blob" />

          {/* Slogan */}
          <div className="absolute top-0 left-0 right-0 z-10 flex flex-col items-center pt-2">
            <h1
              ref={headingRef}
              className="mb-1 text-center leading-[1.2]"
              style={{
                fontFamily: "var(--font-crt)",
                color: "var(--landing-text)",
                fontSize: "28px",
                letterSpacing: "-0.01em",
              }}
            >
              Your next colleague has an email address.
            </h1>
            <p
              ref={sublineRef}
              className="text-center leading-relaxed whitespace-nowrap"
              style={{
                fontFamily: "var(--font-crt)",
                color: "var(--landing-text-muted)",
                fontSize: "14px",
              }}
            >
              Not a chatbox. Not a browser tab. A digital colleague running on
              your machine — with its own inbox.
            </p>
          </div>

          <div className="typewriter-scene">
            <div className="tw-machine">
              {/* 3D Body */}
              <div className="tw-body">
                {/* 3D faces */}
                <div className="tw-body-back" />
                <div className="tw-body-left" />
                <div className="tw-body-right" />
                <div className="tw-body-top" />
                <div className="tw-body-bottom" />

                {/* Front face */}
                <div className="tw-body-front">
                  {/* Paper track — clips paper as it feeds out */}
                  <div className="tw-paper-track">
                  <div className="tw-paper" key={emailIndex}>
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
                  </div>
                  </div>{/* close tw-paper-track */}

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
                        {ri === 1 && (
                          <button
                            className="tw-key tw-return-key"
                            onClick={handleReturnKey}
                            aria-label="Return — load next email"
                          >
                            <span className="tw-return-label">↵</span>
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
                </div>{/* close tw-body-front */}
              </div>
            </div>
          </div>
        </div>

        {/* Specs */}
        <div className="hero-specs mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {[
            "SMTP-Driven",
            "Always-On Daemon",
            "Claude / Codex Runtime",
            "Cloudflare Edge",
          ].map((spec) => (
            <span
              key={spec}
              className="text-xs uppercase tracking-[0.15em]"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--landing-text-muted)",
              }}
            >
              {spec}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div ref={ctaRef} className="mt-8">
          <a
            href="https://github.com/alookai/alook"
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm transition-all duration-200 hover:opacity-80"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--landing-bg)",
              backgroundColor: "var(--landing-text)",
              letterSpacing: "0.05em",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            VIEW SOURCE ON GITHUB
          </a>
        </div>
      </div>
    </section>
  );
}
