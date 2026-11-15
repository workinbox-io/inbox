import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"

type Draft = { dirty: boolean; saving: boolean }
export const SettingsDraftContext = React.createContext<Set<() => Draft> | null>(null)

export function confirmSettingsLeave(drafts: Set<() => Draft> | null) {
  const states = [...(drafts ?? [])].map(read => read())
  if (states.some(state => state.saving)) {
    toast.info("Please wait for the current save to finish.")
    return false
  }
  return !states.some(state => state.dirty) || window.confirm("Discard unsaved changes? Your changes in this section have not been saved.")
}

/** Register the actual saved value, so failed saves and edits reverted by the user stay accurate. */
export function useSettingsDraft(dirty: boolean, saving = false) {
  const drafts = React.useContext(SettingsDraftContext)
  const state = React.useRef({ dirty, saving })
  state.current = { dirty, saving }
  React.useEffect(() => {
    if (!drafts) return
    const read = () => state.current
    drafts.add(read)
    return () => { drafts.delete(read) }
  }, [drafts])
}

