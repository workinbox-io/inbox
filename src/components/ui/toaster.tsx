import { Toaster as Ding } from "@yusufceng1z/ding-react"
import * as React from "react"

/**
 * The theme is the `.dark` class on <html>, the same switch every other component reads
 * (`@custom-variant dark`), watched so a toggle repaints open toasts. No theme provider needed.
 */
function useDocumentTheme(): "light" | "dark" {
  const [theme, setTheme] = React.useState<"light" | "dark">("light")
  React.useEffect(() => {
    const root = document.documentElement
    const read = () => setTheme(root.classList.contains("dark") ? "dark" : "light")
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return theme
}

export function Toaster() {
  return <Ding position="bottom-right" theme={useDocumentTheme()} />
}
