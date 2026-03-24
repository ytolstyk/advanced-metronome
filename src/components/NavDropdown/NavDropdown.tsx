import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavDropdownItem {
  to: string;
  label: string;
  end?: boolean;
}

interface NavDropdownProps {
  label: string;
  items: NavDropdownItem[];
}

export function NavDropdown({ label, items }: NavDropdownProps) {
  const location = useLocation();
  const isGroupActive = items.some(item => {
    if (item.end) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-3.5 py-1.5 text-sm transition-colors outline-none cursor-pointer',
          isGroupActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        {label}
        <ChevronDown size={12} className="opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={5}>
        {items.map(({ to, label: itemLabel, end }) => (
          <DropdownMenuItem key={to} asChild>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'w-full',
                  isActive && 'bg-accent text-accent-foreground'
                )
              }
            >
              {itemLabel}
            </NavLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
