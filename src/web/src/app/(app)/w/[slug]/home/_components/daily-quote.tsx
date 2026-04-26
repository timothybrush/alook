"use client";

import { useEffect, useState } from "react";

const FALLBACK_QUOTES = [
  { q: "Have a wonderful day!", a: "" },
  { q: "Every day is a fresh start.", a: "" },
  { q: "Small steps lead to great journeys.", a: "" },
  { q: "Stay curious, keep building.", a: "" },
];

interface DailyQuote {
  q: string;
  a: string;
}

export function DailyQuote() {
  const [quote, setQuote] = useState<DailyQuote | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("https://zenquotes.io/api/today")
      .then((r) => r.json() as Promise<DailyQuote[]>)
      .then((data) => {
        if (!cancelled && data?.[0]?.q) {
          setQuote(data[0]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          const idx = new Date().getDate() % FALLBACK_QUOTES.length;
          setQuote(FALLBACK_QUOTES[idx]);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (!quote) return null;

  return (
    <div className="text-center py-2">
      <p className="text-xs text-muted-foreground/50 italic">— {quote.q} —</p>
      {quote.a && <p className="text-[10px] text-muted-foreground/40 mt-0.5">{quote.a}</p>}
    </div>
  );
}
