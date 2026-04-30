import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./WelcomePage.css";

const BG_IMAGES = ["/drummallama.jpg", "/drummallama2.jpg"];

const FEATURES = [
  {
    icon: "🥁",
    title: "Drum Machine",
    desc: "Build beat patterns with a full 7-instrument grid",
    route: "/drums",
    color: "#6366f1",
  },
  {
    icon: "🎯",
    title: "Click Track",
    desc: "Custom metronome with subdivisions and speed control",
    route: "/click-track",
    color: "#f59e0b",
  },
  {
    icon: "🎸",
    title: "Tuner",
    desc: "Chromatic tuner using McLeod pitch detection",
    route: "/tuner",
    color: "#10b981",
  },
  {
    icon: "🎹",
    title: "Chords",
    desc: "Chord reference and player for guitar & piano",
    route: "/chords",
    color: "#3b82f6",
  },
  {
    icon: "🎼",
    title: "Scales",
    desc: "Explore scales across all keys and modes",
    route: "/scales",
    color: "#8b5cf6",
  },
  {
    icon: "⭕",
    title: "Circle of 5ths",
    desc: "Visual key relationships and chord families",
    route: "/circle",
    color: "#ec4899",
  },
  {
    icon: "📚",
    title: "Lessons",
    desc: "Structured guitar lessons with progress tracking",
    route: "/lessons",
    color: "#f97316",
  },
  {
    icon: "🎯",
    title: "Fret Memorizer",
    desc: "Quiz yourself on note positions across the fretboard",
    route: "/fret-memorizer",
    color: "#06b6d4",
  },
  {
    icon: "🎸",
    title: "Tab Editor",
    desc: "Write and play back guitar tabs with full notation",
    route: "/tab-editor",
    color: "#84cc16",
  },
  {
    icon: "📖",
    title: "Tab Library",
    desc: "Browse and play guitar tabs shared by the community",
    route: "/tabs",
    color: "#f59e0b",
  },
] as const;

export function WelcomePage() {
  const navigate = useNavigate();
  const [bgImage] = useState(
    () => BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)],
  );

  return (
    <div className="welcome-page">
      <div className="welcome-hero">
        <img
          className="welcome-hero-bg"
          src={bgImage}
          alt=""
          aria-hidden="true"
        />
        <div className="welcome-hero-overlay" />
        <div className="welcome-hero-content">
          <h1 className="welcome-title">Drumma Llama</h1>
          <p className="welcome-tagline">
            Beat tools for musicians — free, in-browser, no install
          </p>
        </div>
      </div>

      <section className="welcome-grid-section">
        <div className="welcome-grid">
          {FEATURES.map((f) => (
            <button
              key={f.route}
              className="welcome-card"
              style={{ "--card-color": f.color } as React.CSSProperties}
              onClick={() => navigate(f.route)}
            >
              <span className="welcome-card-icon">{f.icon}</span>
              <span className="welcome-card-title">{f.title}</span>
              <span className="welcome-card-desc">{f.desc}</span>
              <span className="welcome-card-arrow">Open →</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
