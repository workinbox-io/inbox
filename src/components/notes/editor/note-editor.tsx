/**
 * The note editor: Plate with the "core kit" (headings, lists, to-dos, quotes, code, links, tables, images,
 * @mentions, "/" menu, markdown shortcuts) on a Yjs document shared through the note's Durable Object.
 * The title is a Y.Text in the same document, so it is live too.
 */
import * as React from "react"
import {
  BlockquoteRules,
  BoldRules,
  CodeRules,
  HeadingRules,
  HorizontalRuleRules,
  ItalicRules,
  StrikethroughRules,
} from "@platejs/basic-nodes"
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react"
import { FontBackgroundColorPlugin, FontColorPlugin, TextAlignPlugin } from "@platejs/basic-styles/react"
import { CodeBlockRules } from "@platejs/code-block"
import { CodeBlockPlugin, CodeLinePlugin } from "@platejs/code-block/react"
import { IndentPlugin } from "@platejs/indent/react"
import { LinkRules } from "@platejs/link"
import { LinkPlugin } from "@platejs/link/react"
import { BulletedListRules, OrderedListRules, TaskListRules } from "@platejs/list"
import { ListPlugin } from "@platejs/list/react"
import { MarkdownPlugin } from "@platejs/markdown"
import { ImagePlugin } from "@platejs/media/react"
import { MentionInputPlugin, MentionPlugin } from "@platejs/mention/react"
import { SlashInputPlugin, SlashPlugin } from "@platejs/slash-command/react"
import { TableCellHeaderPlugin, TableCellPlugin, TablePlugin, TableRowPlugin } from "@platejs/table/react"
import { YjsPlugin } from "@platejs/yjs/react"
import { KEYS, TrailingBlockPlugin, type SlateEditor } from "platejs"
import { createPlatePlugin, ParagraphPlugin, Plate, PlateContainer, PlateContent, usePlateEditor } from "platejs/react"
import remarkGfm from "remark-gfm"
import { t } from "@/lib/i18n/panel"
import { userColor } from "@/lib/notes/ticket"
import { cn } from "@/lib/utils"
import {
  BlockList,
  BlockquoteElement,
  CodeBlockElement,
  CodeLeaf,
  CodeLineElement,
  H1Element,
  H2Element,
  H3Element,
  HrElement,
  ImageElement,
  LinkElement,
  MentionElement,
  MentionInputElement,
  ParagraphElement,
  SlashInputElement,
  TableCellElement,
  TableCellHeaderElement,
  TableElement,
  TableRowElement,
} from "./nodes"
import { NOTE_PROVIDER, type NoteTicketResponse } from "./provider"
import { FixedToolbar } from "./fixed-toolbar"
import { FloatingToolbar, LinkFloatingToolbar, RemoteCursorOverlay } from "./toolbar"
import { uploadDataUrl } from "./transforms"

const blockTargets = [...KEYS.heading, KEYS.p, KEYS.blockquote, KEYS.codeBlock, KEYS.img]
const notInCode = ({ editor }: { editor: SlateEditor }) => !editor.api.some({ match: { type: editor.getType(KEYS.codeBlock) } })

const plugins = [
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.configure({ inputRules: [HeadingRules.markdown()], node: { component: H1Element }, rules: { break: { empty: "reset" } } }),
  H2Plugin.configure({ inputRules: [HeadingRules.markdown()], node: { component: H2Element }, rules: { break: { empty: "reset" } } }),
  H3Plugin.configure({ inputRules: [HeadingRules.markdown()], node: { component: H3Element }, rules: { break: { empty: "reset" } } }),
  BlockquotePlugin.configure({ inputRules: [BlockquoteRules.markdown()], node: { component: BlockquoteElement } }),
  HorizontalRulePlugin.configure({ inputRules: [HorizontalRuleRules.markdown({ variant: "-" })], node: { component: HrElement } }),
  BoldPlugin.configure({ inputRules: [BoldRules.markdown({ variant: "*" }), BoldRules.markdown({ variant: "_" })] }),
  ItalicPlugin.configure({ inputRules: [ItalicRules.markdown({ variant: "*" }), ItalicRules.markdown({ variant: "_" })] }),
  UnderlinePlugin,
  StrikethroughPlugin.configure({ inputRules: [StrikethroughRules.markdown()] }),
  CodePlugin.configure({ inputRules: [CodeRules.markdown()], node: { component: CodeLeaf } }),
  FontColorPlugin,
  FontBackgroundColorPlugin,
  TextAlignPlugin.configure({
    inject: {
      nodeProps: { nodeKey: "align", styleKey: "textAlign", defaultNodeValue: "start", validNodeValues: ["start", "left", "center", "right", "end", "justify"] },
      targetPlugins: [...KEYS.heading, KEYS.p, KEYS.img],
    },
  }),
  CodeBlockPlugin.configure({ inputRules: [CodeBlockRules.markdown({ on: "match" })], node: { component: CodeBlockElement } }),
  CodeLinePlugin.withComponent(CodeLineElement),
  IndentPlugin.configure({ inject: { targetPlugins: blockTargets }, options: { offset: 24 } }),
  ListPlugin.configure({
    inputRules: [
      BulletedListRules.markdown({ variant: "-" }),
      BulletedListRules.markdown({ variant: "*" }),
      OrderedListRules.markdown({ variant: "." }),
      TaskListRules.markdown({ checked: false }),
      TaskListRules.markdown({ checked: true }),
    ],
    inject: { targetPlugins: blockTargets },
    render: { belowNodes: BlockList },
  }),
  LinkPlugin.configure({
    inputRules: [LinkRules.markdown(), LinkRules.autolink({ variant: "paste" }), LinkRules.autolink({ variant: "space" }), LinkRules.autolink({ variant: "break" })],
    render: { node: LinkElement, afterEditable: () => <LinkFloatingToolbar /> },
  }),
  TablePlugin.withComponent(TableElement),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellHeaderElement),
  ImagePlugin.configure({ options: { uploadImage: uploadDataUrl }, node: { component: ImageElement } }),
  MentionPlugin.configure({ options: { triggerPreviousCharPattern: /^$|^[\s"'(]$/ }, node: { component: MentionElement } }),
  MentionInputPlugin.withComponent(MentionInputElement),
  SlashPlugin.configure({ options: { triggerQuery: (editor: SlateEditor) => notInCode({ editor }) } }),
  SlashInputPlugin.withComponent(SlashInputElement),
  // Pasting markdown turns into blocks.
  MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } }),
  TrailingBlockPlugin,
  // Inside the editable (Slate's context starts there); hidden while read-only.
  createPlatePlugin({ key: "noteToolbar", editOnly: true, render: { afterEditable: () => <FloatingToolbar /> } }),
]

export interface Presence {
  clientId: number
  name: string
  color: string
}

export interface NoteEditorProps {
  noteId: string
  user: { id: string; name: string }
  /** Readonly from the server (viewer, archived); the ticket can change it on reconnect. */
  onTicket?: (t: NoteTicketResponse) => void
  /** The viewer can no longer open the note (access removed, deleted). */
  onLost?: () => void
  onPresence?: (people: Presence[]) => void
}

export function NoteEditor({ noteId, user, onTicket, onLost, onPresence }: NoteEditorProps) {
  const [canEdit, setCanEdit] = React.useState(false)
  const [synced, setSynced] = React.useState(false)
  const callbacks = React.useRef({ onTicket, onLost })
  callbacks.current = { onTicket, onLost }

  const getTicket = React.useCallback(async (): Promise<NoteTicketResponse | null> => {
    const res = await fetch(`/api/app/notes/${noteId}/ticket`, { method: "POST", headers: { "Content-Type": "application/json" } })
    if (res.status === 403 || res.status === 404 || res.status === 401) {
      callbacks.current.onLost?.()
      return null
    }
    if (!res.ok) throw new Error(`Ticket failed (${res.status})`)
    const ticket = (await res.json()) as NoteTicketResponse
    setCanEdit(ticket.canEdit)
    callbacks.current.onTicket?.(ticket)
    return ticket
  }, [noteId])

  const editor = usePlateEditor(
    {
      id: noteId,
      skipInitialization: true,
      plugins: [
        ...plugins,
        YjsPlugin.configure({
          render: { afterEditable: RemoteCursorOverlay },
          options: {
            cursors: { data: { name: user.name, color: userColor(user.id) } },
            // A provider type registered in ./provider (Plate's config union only lists its own types).
            providers: [{ type: NOTE_PROVIDER, options: { noteId, getTicket } } as never],
            onSyncChange: ({ isSynced }) => setSynced(isSynced),
          },
        }),
      ],
    },
    [noteId],
  )

  React.useEffect(() => {
    const api = editor.getApi(YjsPlugin).yjs
    void api.init({ id: noteId, autoSelect: "end", value: null })
    return () => api.destroy()
  }, [editor, noteId])

  // Who else is here, from the awareness states.
  React.useEffect(() => {
    if (!onPresence) return
    const awareness = editor.getOption(YjsPlugin, "awareness")
    const update = () => {
      const people: Presence[] = []
      awareness.getStates().forEach((state, clientId) => {
        const data = (state as { data?: { name: string; color: string } }).data
        if (clientId !== awareness.clientID && data?.name) people.push({ clientId, ...data })
      })
      onPresence(people)
    }
    awareness.on("change", update)
    update()
    return () => awareness.off("change", update)
  }, [editor, onPresence])

  return (
    <Plate editor={editor} readOnly={!canEdit || !synced}>
      <div className="flex h-full min-h-0 flex-col">
        {canEdit && <FixedToolbar disabled={!synced} />}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8 sm:px-12">
            <NoteTitle editor={editor} readOnly={!canEdit || !synced} />
            <PlateContainer className="relative">
              <PlateContent
                className={cn(
                  "min-h-[50svh] pb-[30svh] text-[15px] leading-7 outline-none [&_strong]:font-semibold",
                  "[&_[data-slate-placeholder]]:!opacity-50",
                  !synced && "pointer-events-none opacity-60",
                )}
                placeholder={canEdit ? t("Write, or press / for blocks and @ to mention someone") : undefined}
                aria-label={t("Note")}
              />
            </PlateContainer>
          </div>
        </div>
      </div>
    </Plate>
  )
}

/** The title: a Y.Text next to the content, edited as a plain input. */
function NoteTitle({ editor, readOnly }: { editor: ReturnType<typeof usePlateEditor>; readOnly: boolean }) {
  const ydoc = editor!.getOption(YjsPlugin, "ydoc")
  const text = React.useMemo(() => ydoc.getText("title"), [ydoc])
  const [value, setValue] = React.useState(() => text.toString())
  React.useEffect(() => {
    const update = () => setValue(text.toString())
    text.observe(update)
    update()
    return () => text.unobserve(update)
  }, [text])
  return (
    <input
      value={value}
      readOnly={readOnly}
      maxLength={200}
      placeholder={t("Untitled")}
      aria-label={t("Title")}
      className="mb-2 w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
      onChange={(e) => {
        const next = e.target.value
        setValue(next)
        ydoc.transact(() => {
          text.delete(0, text.length)
          text.insert(0, next)
        })
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault()
          editor!.tf.focus({ edge: "start" })
        }
      }}
    />
  )
}
