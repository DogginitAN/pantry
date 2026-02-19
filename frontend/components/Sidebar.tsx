"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Home,
  Package,
  Receipt,
  ShoppingCart,
  ChefHat,
  BarChart3,
  Settings,
  Leaf,
} from "lucide-react";

const navItems = [
  { label: "Dashboard",    href: "/dashboard",     icon: Home },
  { label: "Inventory",    href: "/inventory",     icon: Package },
  { label: "Receipts",     href: "/receipts",      icon: Receipt },
  { label: "Shopping List",href: "/shopping-list", icon: ShoppingCart },
  { label: "Meal Planner", href: "/meal-planner",  icon: ChefHat },
  { label: "Spending",     href: "/spending",      icon: BarChart3 },
  { label: "Settings",     href: "/settings",      icon: Settings },
  { label: "About",        href: "/about",         icon: Leaf },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Hamburger button — mobile only */}
      <button
        className="fixed top-3 left-0 z-50 md:hidden bg-parchment border border-linen p-2 rounded-r-md text-warm-700"
        onClick={() => setIsOpen(true)}
        aria-label="Open menu"
        aria-expanded={isOpen}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Backdrop — mobile only, visible when drawer is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar / drawer */}
      <aside
        className={`fixed top-0 left-0 h-full w-56 bg-parchment border-r border-linen flex flex-col py-6 px-4 shrink-0 z-40 transition-transform duration-200 ease-in-out md:static md:translate-x-0 md:z-auto ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8">
          <span className="font-heading text-2xl text-warm-800 tracking-tight">Pantry</span>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200 ${
                  isActive
                    ? "bg-sage-50 text-sage-700 font-semibold"
                    : "text-warm-600 hover:text-warm-800 hover:bg-warm-100 font-medium"
                }`}
              >
                <item.icon className="w-5 h-5" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
