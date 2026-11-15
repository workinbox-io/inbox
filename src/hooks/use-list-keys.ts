import * as React from "react"

/**
 * Keyboard over a text field's suggestion list (an autocomplete): ↑/↓ move the highlighted option and wrap, Escape
 * hides the list until the text changes or an arrow is pressed. The field handles Enter with `active` (-1 = nothing highlighted) and calls
 * `reset()` when its text changes. Spread `inputProps` on the field and `optionProps(i)` on each option for the
 * combobox/listbox roles screen readers announce.
 */
export function useListKeys(count: number, listId: string) {
  const [active, setActive] = React.useState(-1)
  const [hidden, setHidden] = React.useState(false)
  const index = active < count ? active : -1
  const open = count > 0 && !hidden
  const reset = React.useCallback(() => {
    setActive(-1)
    setHidden(false)
  }, [])

  // Escape closes only the list: caught on window in the capture phase, before dialogs and sheets (Radix listens on
  // the document) or an app's shortcuts see it and close what's around the field.
  React.useEffect(() => {
    if (!open) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.activeElement?.getAttribute("aria-controls") !== listId) return
      e.preventDefault()
      e.stopPropagation()
      setHidden(true)
      setActive(-1)
    }
    window.addEventListener("keydown", onEscape, true)
    return () => window.removeEventListener("keydown", onEscape, true)
  }, [open, listId])

  /** True when the key was handled (the caller skips its own handling). */
  function onKeyDown(e: React.KeyboardEvent): boolean {
    if (!count || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return false
    e.preventDefault()
    // After Escape, an arrow brings the list back.
    setHidden(false)
    setActive(e.key === "ArrowDown" ? (index + 1) % count : index <= 0 ? count - 1 : index - 1)
    return true
  }

  return {
    active: index,
    open,
    reset,
    onKeyDown,
    inputProps: {
      role: "combobox" as const,
      "aria-expanded": open,
      "aria-controls": listId,
      "aria-autocomplete": "list" as const,
      "aria-activedescendant": open && index >= 0 ? `${listId}-${index}` : undefined,
    },
    listProps: { id: listId, role: "listbox" as const },
    optionProps: (i: number) => ({
      id: `${listId}-${i}`,
      role: "option" as const,
      "aria-selected": i === index,
      onMouseEnter: () => setActive(i),
    }),
  }
}
