/**
 * The mail composer's body: Plate (as in Notes) with bold/italic/underline/strike (⌘B/⌘I/⌘U), lists, quotes,
 * links, and "@" for anything (people, files, notes, events, contacts, threads, channels; components/workspace/mentions).
 * The document goes to the server as `doc`; lib/mail/doc-render.ts turns it into the e-mail's HTML and text.
 * Collections' record descriptions use the same editor (`label`, `readOnly`, no submit).
 */
import * as React from "react"
import { BlockquoteRules, BoldRules, ItalicRules, StrikethroughRules } from "@platejs/basic-nodes"
import { BlockquotePlugin, BoldPlugin, ItalicPlugin, StrikethroughPlugin, UnderlinePlugin } from "@platejs/basic-nodes/react"
import { IndentPlugin } from "@platejs/indent/react"
import { LinkRules } from "@platejs/link"
import { LinkPlugin } from "@platejs/link/react"
import { BulletedListRules, OrderedListRules } from "@platejs/list"
import { ListPlugin } from "@platejs/list/react"
import { getMentionOnSelectItem } from "@platejs/mention"
import { MentionInputPlugin, MentionPlugin } from "@platejs/mention/react"
import { KEYS, type TComboboxInputElement, type TMentionElement, type Value } from "platejs"
import { ParagraphPlugin, Plate, PlateContent, PlateElement, useFocused, usePlateEditor, useSelected, type PlateElementProps } from "platejs/react"
import { BlockList, BlockquoteElement, LinkElement, ParagraphElement } from "@/components/notes/editor/nodes"
import { InlineCombobox, InlineComboboxContent, InlineComboboxEmpty, InlineComboboxGroup, InlineComboboxGroupLabel, InlineComboboxInput, InlineComboboxItem } from "@/components/notes/editor/inline-combobox"
import { InlineMentionIcon, KIND_LABEL, MentionIcon, useMentionSearch } from "@/components/workspace/mentions"
import { useMounted } from "@/components/workspace/ui"
import { docToText, mentionRef, textToDoc } from "@/lib/mail/doc-render"
import { t } from "@/lib/i18n/panel"
import type { Mentionable } from "@/lib/mentions"
import { cn } from "@/lib/utils"

type MailMention = TMentionElement & { seed?: string; mediaType?: string | null; folder?: boolean; url?: string }

function MailMentionElement(props: PlateElementProps<MailMention>) {
  const selected = useSelected()
  const focused = useFocused()
  const el = props.element
  const ref = mentionRef(el)
  const icon: Mentionable = ref
    ? { kind: ref.kind, id: ref.id, title: ref.title, ...(el.mediaType ? { mediaType: el.mediaType } : {}), ...(el.folder ? { folder: true } : {}) }
    : { kind: "person", id: String(el.key ?? ""), title: el.value, ...(el.seed ? { seed: el.seed } : {}) }
  return (
    <PlateElement
      {...props}
      // Like the chip in a sent message: a link in the text, not a box (people: "@Name" in the accent colour).
      className={cn("rounded-sm font-medium", ref ? "underline decoration-foreground/25 underline-offset-[3px]" : "text-primary", selected && focused && "bg-primary/10")}
      attributes={{ ...props.attributes, contentEditable: false, "data-slate-value": el.value, draggable: true }}
    >
      {ref ? <InlineMentionIcon item={icon} /> : null}
      {ref ? el.value : `@${el.value}`}
      {props.children}
    </PlateElement>
  )
}

const onSelectMention = getMentionOnSelectItem()

function MailMentionInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props
  const [search, setSearch] = React.useState("")
  const results = useMentionSearch(search)
  const labels = KIND_LABEL()
  const pick = (m: Mentionable) => {
    const key = m.kind === "person" ? `person:${m.id}` : `${m.kind}:${m.id}`
    onSelectMention(editor, { key, text: m.title }, search)
    // The picker knows the avatar and file type; keep them on the node for its icon.
    editor.tf.setNodes({ seed: m.seed, mediaType: m.mediaType, folder: m.folder }, { at: [], mode: "all", match: (n) => (n as MailMention).type === KEYS.mention && (n as MailMention).key === key })
  }
  const groups = [...new Set(results.map((r) => r.kind))]
  return (
    <PlateElement {...props} as="span">
      <InlineCombobox value={search} element={element} setValue={setSearch} showTrigger={false} trigger="@" filter={false}>
        <span className="bg-muted inline-block rounded-md px-1.5 py-0.5 align-baseline text-sm">
          @<InlineComboboxInput />
        </span>
        <InlineComboboxContent className="my-1.5 w-72">
          <InlineComboboxEmpty>{t("Nothing found")}</InlineComboboxEmpty>
          {groups.map((kind) => (
            <InlineComboboxGroup key={kind}>
              <InlineComboboxGroupLabel>{labels[kind]}</InlineComboboxGroupLabel>
              {results
                .filter((r) => r.kind === kind)
                .map((m) => (
                  <InlineComboboxItem key={`${m.kind}:${m.id}`} value={`${m.kind}:${m.id}`} onClick={() => pick(m)} className="gap-2">
                    <MentionIcon item={m} />
                    <span className="truncate">{m.title}</span>
                    {m.subtitle && m.kind !== "event" ? <span className="text-muted-foreground ml-auto truncate text-xs">{t(m.subtitle)}</span> : null}
                  </InlineComboboxItem>
                ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>
      {props.children}
    </PlateElement>
  )
}

const plugins = [
  ParagraphPlugin.withComponent(ParagraphElement),
  BlockquotePlugin.configure({ inputRules: [BlockquoteRules.markdown()], node: { component: BlockquoteElement } }),
  BoldPlugin.configure({ inputRules: [BoldRules.markdown({ variant: "*" })] }),
  ItalicPlugin.configure({ inputRules: [ItalicRules.markdown({ variant: "_" })] }),
  UnderlinePlugin,
  StrikethroughPlugin.configure({ inputRules: [StrikethroughRules.markdown()] }),
  IndentPlugin.configure({ inject: { targetPlugins: [KEYS.p, KEYS.blockquote] }, options: { offset: 24 } }),
  ListPlugin.configure({
    inputRules: [BulletedListRules.markdown({ variant: "-" }), BulletedListRules.markdown({ variant: "*" }), OrderedListRules.markdown({ variant: "." })],
    inject: { targetPlugins: [KEYS.p, KEYS.blockquote] },
    render: { belowNodes: BlockList },
  }),
  LinkPlugin.configure({ inputRules: [LinkRules.markdown(), LinkRules.autolink({ variant: "paste" }), LinkRules.autolink({ variant: "space" }), LinkRules.autolink({ variant: "break" })], render: { node: LinkElement } }),
  MentionPlugin.configure({ options: { triggerPreviousCharPattern: /^$|^[\s"'(]$/ }, node: { component: MailMentionElement } }),
  MentionInputPlugin.withComponent(MailMentionInputElement),
]

export interface MailEditorHandle {
  focus: () => void
  /** At the caret (or the end): a template's text. */
  insertText: (text: string) => void
}

export function MailEditor({
  initial,
  initialText,
  onChange,
  onSubmit,
  placeholder,
  className,
  label,
  readOnly,
  ref,
}: {
  /** The draft's document; without one, its text as paragraphs. Read once: remount (key) for another draft. */
  initial?: Value
  initialText: string
  onChange: (doc: Value, text: string) => void
  /** ⌘/Ctrl+Enter. */
  onSubmit?: () => void
  placeholder?: string
  className?: string
  /** The field's accessible name (default "Message"). */
  label?: string
  readOnly?: boolean
  ref?: React.Ref<MailEditorHandle>
}) {
  const mounted = useMounted()
  const editor = usePlateEditor({ plugins, value: initial?.length ? initial : (textToDoc(initialText) as Value) })
  // A draft that changed elsewhere (another tab, an AI app, a discard) replaces the content; our own edits come back
  // unchanged. Drafts without a document (written as text) compare by text.
  const emitted = React.useRef({ doc: initial, text: initialText })
  React.useEffect(() => {
    const last = emitted.current
    if (initial === last.doc && (initial || initialText === last.text)) return
    // The same content parsed again (a draft sync): keep the caret.
    if (initial ? JSON.stringify(initial) === JSON.stringify(editor.children) : initialText === last.text) {
      emitted.current = { doc: initial, text: initialText }
      return
    }
    editor.tf.setValue(initial?.length ? initial : (textToDoc(initialText) as Value))
    // What the editor now holds counts as already known, so the reset isn't reported back as an edit.
    emitted.current = { doc: editor.children, text: initialText }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, initialText])
  React.useImperativeHandle(
    ref,
    () => ({
      focus: () => editor.tf.focus({ edge: "start" }),
      insertText: (text: string) => {
        if (!editor.selection) editor.tf.select(editor.api.end([]))
        editor.tf.insertFragment(textToDoc(text) as Value)
        editor.tf.focus()
      },
    }),
    [editor],
  )
  // Plate renders only in the browser (like Notes): until then a box of the same size.
  if (!mounted) return <div className={cn("min-h-32 shrink-0 grow", className)} />
  return (
    <Plate
      editor={editor}
      onChange={({ editor: e, value }) => {
        // Only real edits: not selection moves, not the load or a reset (which would mark the draft as typed in).
        if (value === emitted.current.doc || e.operations.every((op) => op.type === "set_selection")) return
        const text = docToText(value, location.origin)
        emitted.current = { doc: value, text }
        onChange(value, text)
      }}
    >
      <PlateContent
        aria-label={label ?? t("Message")}
        placeholder={placeholder}
        readOnly={readOnly}
        className={cn("min-h-32 shrink-0 grow overflow-y-auto px-4 py-3 text-[15px] leading-6 outline-none [&_strong]:font-semibold [&_[data-slate-placeholder]]:!opacity-50", className)}
        onKeyDown={(e) => {
          if (!onSubmit || e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.nativeEvent.isComposing) return
          e.preventDefault()
          onSubmit()
        }}
      />
    </Plate>
  )
}
