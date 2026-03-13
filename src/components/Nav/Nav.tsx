import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/AuthModal/AuthModal";

const LINKS = [
  { to: "/", label: "Drum Machine", end: true },
  { to: "/tuner", label: "Tuner" },
  { to: "/chords", label: "Chords" },
  { to: "/scales", label: "Scales" },
  { to: "/circle", label: "Circle of 5ths" },
];

function linkCls(isActive: boolean, mobile = false) {
  const base = "text-sm rounded-md transition-colors duration-150 no-underline";
  const size = mobile ? "block px-4 py-2.5 w-full" : "px-3.5 py-1.5";
  const state = isActive
    ? "bg-[#1e1e1e] text-[#f0f0f0]"
    : "text-[#b0b0b0] hover:text-[#eee] hover:bg-[#1a1a1a]";
  return `${base} ${size} ${state}`;
}

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-[#0a0a0a] border-b border-[#222]">
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-base font-bold tracking-tight text-[#f0f0f0]">
          Drumma Llama
        </span>

        <div className="flex items-center gap-1">
          {/* Desktop links */}
          <div className="hidden sm:flex gap-1">
            {LINKS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => linkCls(isActive)}
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* Auth button — desktop */}
          <div className="hidden sm:block ml-1">
            <AuthModal />
          </div>

          {/* Mobile burger */}
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden text-[#888] hover:text-[#eee] hover:bg-[#1a1a1a]"
            onClick={() => setOpen(o => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="sm:hidden flex flex-col px-3 pb-3 gap-0.5 border-t border-[#222]">
          {LINKS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => linkCls(isActive, true)}
              onClick={() => setOpen(false)}
            >
              {label}
            </NavLink>
          ))}
          <div className="pt-1 border-t border-[#1a1a1a] mt-0.5">
            <AuthModal />
          </div>
        </div>
      )}
    </nav>
  );
}
