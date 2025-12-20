"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  // Load saved theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const light = savedTheme === "light";

    setIsLight(light);
    document.documentElement.classList.toggle("light", light);
  }, []);

  const toggleTheme = () => {
    const nextLight = !isLight;
    setIsLight(nextLight);

    document.documentElement.classList.toggle("light", nextLight);
    localStorage.setItem("theme", nextLight ? "light" : "dark");
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2.5 rounded-xl bg-secondary hover:bg-accent
                 text-muted-foreground hover:text-foreground
                 transition-all duration-200 hover:scale-105 cursor-pointer"
      aria-label="Toggle theme"
    >
      <Image
        src={
          isLight
            ? "/dark-50.png" // dark icon
            : "/light-50.png" // light icon
        }
        alt="Theme Icon"
        width={20}
        height={20}
      />
    </button>
  );
}
