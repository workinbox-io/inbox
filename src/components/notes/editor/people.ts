/** Members of the org for @mentions and sharing: fetched once per tab from /api/app/notes/people. */
import * as React from "react"
import { api } from "@/lib/api-client"

export interface NotePerson {
  id: string
  name: string
  email: string
  image: string | null
}

let cache: Promise<NotePerson[]> | null = null

export function loadNotePeople() {
  cache ??= api<{ people: NotePerson[] }>("GET", "/api/app/notes/people")
    .then((r) => r.people)
    .catch(() => {
      cache = null
      return []
    })
  return cache
}

export function useNotePeople() {
  const [people, setPeople] = React.useState<NotePerson[]>([])
  React.useEffect(() => {
    let live = true
    void loadNotePeople().then((p) => live && setPeople(p))
    return () => {
      live = false
    }
  }, [])
  return people
}
