"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme();

  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full", className)}
      aria-label="Toggle color theme"
      onClick={() => {
        const isDark = document.documentElement.classList.contains("dark");
        setTheme(isDark ? "light" : "dark");
      }}
    >
      <Sun className="dark:hidden" aria-hidden="true" />
      <Moon className="hidden dark:inline" aria-hidden="true" />
    </button>
  );
}
