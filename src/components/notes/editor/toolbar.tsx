/**
 * The editor's floating parts: the selection toolbar (marks, block type, link), the link popover and the
 * other people's cursors. Patterns from the Plate UI registry (MIT, platejs.org), in the app's styles.
 */
import * as React from "react"
import { flip, offset, useFloatingToolbar, useFloatingToolbarState, type UseVirtualFloatingOptions } from "@platejs/floating"
import { getLinkAttributes } from "@platejs/link"
import {
  FloatingLinkUrlInput,
  useFloatingLinkEdit,
  useFloatingLinkEditState,
  useFloatingLinkInsert,
  useFloatingLinkInsertState,
  useLinkToolbarButton,
  useLinkToolbarButtonState,
} from "@platejs/link/react"
import { YjsPlugin } from "@platejs/yjs/react"
import { useRemoteCursorOverlayPositions, type CursorOverlayData } from "@slate-yjs/react"
import { Bold, Check, ChevronDown, Code, ExternalLink, Italic, Link, Strikethrough, Underline, Unlink } from "lucide-react"
import { KEYS, type TLinkElement } from "platejs"
import {
  useEditorContainerRef,
  useEditorId,
  useEditorRef,
  useEditorSelection,
  useEditorSelector,
  useEventEditorValue,
  useFormInputProps,
  useMarkToolbarButton,
  useMarkToolbarButtonState,
  usePluginOption,
} from "platejs/react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { SLASH_GROUPS, setBlockType } from "./transforms"

export const toolButton =
  "inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground [&_svg]:size-4"

export function FloatingToolbar() {
  const editorId = useEditorId()
  const focusedEditorId = useEventEditorValue("focus")
  const linkOpen = !!usePluginOption({ key: KEYS.link }, "mode")
  const state = useFloatingToolbarState({
    editorId,
    focusedEditorId,
    hideToolbar: linkOpen,
    floatingOptions: {
      middleware: [offset(10), flip({ fallbackPlacements: ["top-start", "top-end", "bottom-start", "bottom-end"], padding: 12 })],
      placement: "top",
    },
  })
  const { clickOutsideRef, hidden, props, ref } = useFloatingToolbar(state)
  if (hidden) return null
  return (
    <TooltipProvider delayDuration={400}>
    <div ref={clickOutsideRef}>
      <div
        {...props}
        ref={ref}
        role="toolbar"
        className="absolute z-50 flex max-w-[80vw] items-center gap-0.5 overflow-x-auto rounded-lg border bg-popover p-1 whitespace-nowrap shadow-md print:hidden"
      >
        <TurnInto />
        <span className="mx-0.5 h-5 w-px bg-border" />
        <Mark nodeType={KEYS.bold} label={t("Bold")} icon={Bold} />
        <Mark nodeType={KEYS.italic} label={t("Italic")} icon={Italic} />
        <Mark nodeType={KEYS.underline} label={t("Underline")} icon={Underline} />
        <Mark nodeType={KEYS.strikethrough} label={t("Strikethrough")} icon={Strikethrough} />
        <Mark nodeType={KEYS.code} label={t("Code")} icon={Code} />
        <LinkButton />
      </div>
    </div>
    </TooltipProvider>
  )
}

/** A toolbar button with a tooltip; keeps the editor's selection on mouse down. */
export function ToolButton({
  label,
  pressed,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string; pressed?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          className={cn(toolButton, className)}
          onMouseDown={(e) => e.preventDefault()}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export function Mark({ nodeType, label, icon: Icon }: { nodeType: string; label: string; icon: typeof Bold }) {
  const state = useMarkToolbarButtonState({ nodeType })
  const { props } = useMarkToolbarButton(state)
  return (
    <ToolButton label={label} pressed={props.pressed} onClick={props.onClick}>
      <Icon />
    </ToolButton>
  )
}

export function LinkButton() {
  const state = useLinkToolbarButtonState()
  const { props } = useLinkToolbarButton(state)
  return (
    <ToolButton label={`${t("Link")} (${typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}K)`} pressed={props.pressed} onClick={props.onClick} onMouseDown={props.onMouseDown}>
      <Link />
    </ToolButton>
  )
}

const TURN_INTO = SLASH_GROUPS[0].items

export function TurnInto() {
  const editor = useEditorRef()
  const current = useEditorSelector((ed) => {
    const block = ed.api.block()
    if (!block) return KEYS.p
    const [node] = block
    if (node.listStyleType === "todo") return KEYS.listTodo
    if (node.listStyleType === "decimal") return KEYS.ol
    if (node.listStyleType) return KEYS.ul
    return node.type as string
  }, [])
  const active = TURN_INTO.find((i) => i.value === current) ?? TURN_INTO[0]
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={toolButton} onMouseDown={(e) => e.preventDefault()}>
        {t(active.label)}
        <ChevronDown className="!size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onCloseAutoFocus={(e) => { e.preventDefault(); editor.tf.focus() }}>
        {TURN_INTO.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setBlockType(editor, value)}>
            <Icon className="text-muted-foreground" />
            <span className="flex-1">{t(label)}</span>
            {value === active.value && <Check className="text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const linkFloating: UseVirtualFloatingOptions = {
  middleware: [offset(8), flip({ fallbackPlacements: ["bottom-end", "top-start", "top-end"], padding: 12 })],
  placement: "bottom-start",
}

const popover = "z-50 w-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-hidden"
const linkInput = "flex h-8 w-full rounded-md border-none bg-transparent px-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none"

/** Insert a link (Ctrl+K or the toolbar) and edit, open or remove one under the cursor. */
export function LinkFloatingToolbar() {
  const insertState = useFloatingLinkInsertState({ floatingOptions: linkFloating })
  const { hidden, props: insertProps, ref: insertRef, textInputProps } = useFloatingLinkInsert(insertState)
  const editState = useFloatingLinkEditState({ floatingOptions: linkFloating })
  const { editButtonProps, props: editProps, ref: editRef, unlinkButtonProps } = useFloatingLinkEdit(editState)
  const inputProps = useFormInputProps({ preventDefaultOnEnterKeydown: true })
  if (hidden) return null

  const input = (
    <div className="flex w-[320px] flex-col" {...inputProps}>
      <div className="flex items-center">
        <Link className="mx-2 size-4 shrink-0 text-muted-foreground" />
        <FloatingLinkUrlInput className={linkInput} placeholder={t("Paste a link")} data-plate-focus />
      </div>
      <div className="my-1 h-px bg-border" />
      <div className="flex items-center">
        <span className="mx-2 w-4 shrink-0 text-center text-xs text-muted-foreground">T</span>
        <input className={linkInput} placeholder={t("Text to display")} data-plate-focus {...textInputProps} />
      </div>
    </div>
  )

  return (
    <>
      <div ref={insertRef} className={popover} {...insertProps}>
        {input}
      </div>
      <div ref={editRef} className={popover} {...editProps}>
        {editState.isEditing ? (
          input
        ) : (
          <div className="flex items-center gap-0.5">
            <button type="button" className={toolButton} {...editButtonProps}>
              {t("Edit link")}
            </button>
            <OpenLink />
            <button type="button" className={toolButton} aria-label={t("Remove link")} title={t("Remove link")} {...unlinkButtonProps}>
              <Unlink />
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function OpenLink() {
  const editor = useEditorRef()
  const selection = useEditorSelection()
  const attributes = React.useMemo(() => {
    const entry = editor.api.node<TLinkElement>({ match: { type: editor.getType(KEYS.link) } })
    return entry ? getLinkAttributes(editor, entry[0]) : {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, selection])
  return (
    <a {...attributes} target="_blank" rel="noopener noreferrer" className={toolButton} aria-label={t("Open link")} title={t("Open link")}>
      <ExternalLink />
    </a>
  )
}

type CursorData = {
  name: string
  color: string
}

/** Other people's carets and selections, with their names. */
export function RemoteCursorOverlay() {
  const synced = usePluginOption(YjsPlugin, "_isSynced")
  return synced ? <Cursors /> : null
}

function Cursors() {
  const containerRef = useEditorContainerRef() as React.RefObject<HTMLDivElement>
  const [cursors] = useRemoteCursorOverlayPositions<CursorData>({ containerRef })
  return (
    <>
      {cursors.map((cursor) => (
        <RemoteSelection key={cursor.clientId} {...cursor} />
      ))}
    </>
  )
}

function RemoteSelection({ caretPosition, data, selectionRects }: CursorOverlayData<CursorData>) {
  if (!data) return null
  const tint = `color-mix(in srgb, ${data.color} 25%, transparent)`
  return (
    <>
      {selectionRects.map((rect, i) => (
        <div key={i} className="pointer-events-none absolute" style={{ ...rect, backgroundColor: tint }} />
      ))}
      {caretPosition && (
        <div className="pointer-events-none absolute w-0.5" style={{ ...caretPosition, background: data.color }}>
          <div
            className="absolute top-0 -translate-y-full rounded rounded-bl-none px-1.5 py-0.5 text-xs whitespace-nowrap text-white"
            style={{ background: data.color }}
          >
            {data.name}
          </div>
        </div>
      )}
    </>
  )
}

