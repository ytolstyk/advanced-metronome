import { NavLink } from "react-router-dom";
import "./Nav.css";

export function Nav() {
  return (
    <nav className="nav">
      <span className="nav-brand">Drumma Llama</span>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Drum Machine
        </NavLink>
        <NavLink to="/tuner" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Tuner
        </NavLink>
        <NavLink to="/chords" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Chords
        </NavLink>
      </div>
    </nav>
  );
}
