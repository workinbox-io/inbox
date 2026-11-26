/**
 * The open collection's view: the config in use, the saved views (collection_views, from the page loader) and the
 * one picked (`?v=<id>`). Without a saved view the config is remembered per collection in this browser; with one,
 * changes stay unsaved ("dirty") until "Update view". Older links' `?view=`, `?group=`, `?lanes=` still apply.
 */
import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import { api } from "@/lib/api-client"
import { defaultView, normalizeView, sameView, type ViewConfig } from "@/lib/collections/view-config"
import { replaceUrl } from "@/lib/panel-history"
import type { SavedView } from "@/lib/server/collection-views"
import type { Collection } from "@/lib/server/collections"

const storeKey = (id: string) => `collections:view:${id}`

function stored(c: Collection) {
  try {
    const raw = localStorage.getItem(storeKey(c.id))
    return raw ? normalizeView(JSON.parse(raw), c.fields) : null
  } catch {
    return null
  }
}

function initial(c: Collection | null, views: SavedView[]): { config: ViewConfig; viewId: string | null } {
  if (!c) return { config: defaultView([]), viewId: null }
  if (typeof location === "undefined") return { config: defaultView(c.fields), viewId: null }
  const params = new URLSearchParams(location.search)
  const saved = views.find((v) => v.id === params.get("v"))
  if (saved) return { config: saved.config, viewId: saved.id }
  const legacy = { view: params.get("view"), group: params.get("group"), lanes: params.get("lanes") }
  const base = stored(c) ?? defaultView(c.fields)
  const config = normalizeView({ ...base, ...(legacy.view ? { layout: legacy.view } : {}), ...(legacy.group ? { group: legacy.group } : {}), ...(legacy.lanes ? { lanes: legacy.lanes } : {}) }, c.fields)
  return { config, viewId: null }
}

export function useCollectionView(collection: Collection | null, initialViews: SavedView[]) {
  const [views, setViews] = React.useState(initialViews)
  const [state, setState] = React.useState(() => initial(collection, initialViews))
  React.useEffect(() => {
    setViews(initialViews)
    setState(initial(collection, initialViews))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new collection or a fresh load
  }, [collection?.id, initialViews])
  const { config, viewId } = state
  const active = views.find((v) => v.id === viewId) ?? null
  const dirty = !!active && !sameView(active.config, config)

  const setUrl = (id: string | null) => {
    const url = new URL(location.href)
    for (const k of ["view", "group", "lanes"]) url.searchParams.delete(k)
    if (id) url.searchParams.set("v", id)
    else url.searchParams.delete("v")
    replaceUrl(url)
  }

  const setConfig = React.useCallback(
    (patch: Partial<ViewConfig>) =>
      setState((s) => {
        if (!collection) return s
        const config = normalizeView({ ...s.config, ...patch }, collection.fields)
        if (!s.viewId)
          try {
            localStorage.setItem(storeKey(collection.id), JSON.stringify(config))
          } catch {}
        return { ...s, config }
      }),
    [collection],
  )

  const base = collection ? `/api/app/collections/${collection.id}/views` : ""
  const run = async <T>(work: () => Promise<T>) => {
    try {
      return await work()
    } catch (e) {
      toast.error((e as Error).message)
      return null
    }
  }

  return {
    config,
    setConfig,
    views,
    active,
    dirty,
    select(id: string | null) {
      const v = views.find((x) => x.id === id)
      setState({ config: v?.config ?? (collection ? stored(collection) ?? defaultView(collection.fields) : config), viewId: v?.id ?? null })
      setUrl(v?.id ?? null)
    },
    reset() {
      if (active) setState({ config: active.config, viewId: active.id })
    },
    saveAs: (name: string, team: boolean) =>
      run(async () => {
        const v = await api<SavedView>("POST", base, { name, team, config })
        setViews((list) => [...list, v])
        setState({ config: v.config, viewId: v.id })
        setUrl(v.id)
        return v
      }),
    update: () =>
      run(async () => {
        if (!active) return null
        const v = await api<SavedView>("PATCH", `${base}/${active.id}`, { config })
        setViews((list) => list.map((x) => (x.id === v.id ? v : x)))
        return v
      }),
    rename: (id: string, name: string) =>
      run(async () => {
        const v = await api<SavedView>("PATCH", `${base}/${id}`, { name })
        setViews((list) => list.map((x) => (x.id === v.id ? v : x)))
      }),
    remove: (id: string) =>
      run(async () => {
        await api("DELETE", `${base}/${id}`)
        setViews((list) => list.filter((x) => x.id !== id))
        if (viewId === id) {
          setState({ config: collection ? stored(collection) ?? defaultView(collection.fields) : config, viewId: null })
          setUrl(null)
        }
      }),
  }
}
