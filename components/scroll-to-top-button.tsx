"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronUp } from "lucide-react"

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 300)
    }

    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const scrollToTop = () => {
    try {
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch {
      window.scrollTo(0, 0)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        aria-label="Nach oben scrollen"
        title="Nach oben"
        onClick={scrollToTop}
        variant="outline"
        size="icon-lg"
        className={`rounded-full shadow-md cursor-pointer transition-opacity duration-300 bg-background/80 dark:bg-input/40 backdrop-blur-sm ${
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <ChevronUp className="size-5" />
      </Button>
    </div>
  )
}
