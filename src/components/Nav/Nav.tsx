import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/AuthModal/AuthModal";
import { NavDropdown } from "@/components/NavDropdown/NavDropdown";

const NAV_GROUPS = [
  {
    label: "Tools",
    items: [
      { to: "/drums", label: "Drum Machine" },
      { to: "/tuner", label: "Tuner" },
      { to: "/click-track", label: "Click Track" },
    ],
  },
  {
    label: "Learn",
    items: [
      { to: "/chords", label: "Chords" },
      { to: "/scales", label: "Scales" },
      { to: "/circle", label: "Circle of 5ths" },
      { to: "/lessons", label: "Lessons" },
    ],
  },
];

function linkCls(isActive: boolean) {
  const base = "text-sm rounded-md transition-colors duration-150 no-underline block px-4 py-2.5 w-full";
  const state = isActive
    ? "bg-[#1e1e1e] text-[#f0f0f0]"
    : "text-[#b0b0b0] hover:text-[#eee] hover:bg-[#1a1a1a]";
  return `${base} ${state}`;
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
          {/* Desktop dropdown groups */}
          <div className="hidden sm:flex gap-1">
            {NAV_GROUPS.map((group) => (
              <NavDropdown
                key={group.label}
                label={group.label}
                items={group.items}
              />
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
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#666] px-4 pt-2 pb-1">
                {group.label}
              </span>
              {group.items.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => linkCls(isActive)}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="pt-1 border-t border-[#1a1a1a] mt-0.5">
            <AuthModal />
          </div>
        </div>
      )}
    </nav>
  );
}
