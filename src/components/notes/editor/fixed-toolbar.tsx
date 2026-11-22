/**
 * The bar above a note, laid out like Plate's playground (platejs.org, MIT): undo/redo, insert and turn into,
 * marks and colours, alignment and lists, link/table/image, indent. Lives inside <Plate>, above the scroll area.
 */
import * as React from "react"
import { TextAlignPlugin } from "@platejs/basic-styles/react"
import { useIndentButton, useOutdentButton } from "@platejs/indent/react"
import { someList, toggleList } from "@platejs/list"
import { useIndentTodoToolBarButton, useIndentTodoToolBarButtonState } from "@platejs/list/react"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
  Code,
  Highlighter,
  ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Plus,
  Redo2,
  Strikethrough,
  Table,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import { KEYS, type TRange } from "platejs"
import { useEditorRef, useEditorSelector, useSelectionFragmentProp } from "platejs/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { msg, t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { LinkButton, Mark, ToolButton, toolButton, TurnInto } from "./toolbar"
import { insertBlock, pickImage, SLASH_GROUPS } from "./transforms"

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"

export function FixedToolbar({ disabled }: { disabled?: boolean }) {
  return (
    <TooltipProvider delayDuration={400}>
      <div
        role="toolbar"
        aria-label={t("Formatting")}
        aria-disabled={disabled || undefined}
        className={cn(
          "flex shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2 py-1 [scrollbar-width:none] print:hidden",
          // No dimming while the note connects: it flashed grey for a moment on every open.
          disabled && "pointer-events-none",
        )}
      >
        <Group>
          <HistoryButton redo={false} />
          <HistoryButton redo />
        </Group>
        <Group>
          <InsertMenu />
          <TurnInto />
        </Group>
        <Group>
          <Mark nodeType={KEYS.bold} label={`${t("Bold")} (${mod}B)`} icon={Bold} />
          <Mark nodeType={KEYS.italic} label={`${t("Italic")} (${mod}I)`} icon={Italic} />
          <Mark nodeType={KEYS.underline} label={`${t("Underline")} (${mod}U)`} icon={Underline} />
          <Mark nodeType={KEYS.strikethrough} label={t("Strikethrough")} icon={Strikethrough} />
          <Mark nodeType={KEYS.code} label={`${t("Code")} (${mod}E)`} icon={Code} />
          <ColorButton nodeType={KEYS.color} label={t("Text color")} icon={Baseline} colors={TEXT_COLORS} />
          <ColorButton nodeType={KEYS.backgroundColor} label={t("Highlight")} icon={Highlighter} colors={BACKGROUND_COLORS} />
        </Group>
        <Group>
          <AlignButton />
          <ListButton style="decimal" label={t("Numbered list")} icon={ListOrdered} />
          <ListButton style="disc" label={t("Bulleted list")} icon={List} />
          <TodoButton />
        </Group>
        <Group>
          <LinkButton />
          <InsertButton type={KEYS.table} label={t("Table")} icon={Table} />
          <ImageButton />
        </Group>
        <Group last>
          <OutdentButton />
          <IndentButton />
        </Group>
      </div>
    </TooltipProvider>
  )
}

function Group({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-0.5">{children}</div>
      {!last && <span className="mx-1 h-5 w-px shrink-0 bg-border" />}
    </>
  )
}

/** Yjs keeps the history (Y.UndoManager), so only this person's own changes are undone. */
function HistoryButton({ redo }: { redo: boolean }) {
  const editor = useEditorRef()
  return (
    <ToolButton
      label={redo ? `${t("Redo")} (${mod}⇧Z)` : `${t("Undo")} (${mod}Z)`}
      onClick={() => {
        if (redo) editor.redo()
        else editor.undo()
        editor.tf.focus()
      }}
    >
      {redo ? <Redo2 /> : <Undo2 />}
    </ToolButton>
  )
}

function InsertMenu() {
  const editor = useEditorRef()
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger className={toolButton} aria-label={t("Insert")} onMouseDown={(e) => e.preventDefault()}>
            <Plus />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("Insert")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="max-h-[min(500px,70vh)] min-w-48 overflow-y-auto" onCloseAutoFocus={(e) => e.preventDefault()}>
        {SLASH_GROUPS.map(({ group, items }) => (
          <DropdownMenuGroup key={group}>
            <DropdownMenuLabel className="text-muted-foreground text-xs">{t(group)}</DropdownMenuLabel>
            {items.map(({ value, label, icon: Icon, onSelect }) => (
              <DropdownMenuItem
                key={value}
                onSelect={() => {
                  editor.tf.focus()
                  onSelect(editor, value)
                }}
              >
                <Icon className="text-muted-foreground" />
                {t(label)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Mid tones that read on light and dark backgrounds; highlights are translucent for the same reason.
const TEXT_COLORS = [
  { name: msg("Gray"), value: "#8a8a85" },
  { name: msg("Brown"), value: "#a0694f" },
  { name: msg("Orange"), value: "#d9730d" },
  { name: msg("Yellow"), value: "#c29a1d" },
  { name: msg("Green"), value: "#3f9468" },
  { name: msg("Blue"), value: "#2f86c4" },
  { name: msg("Purple"), value: "#9065b0" },
  { name: msg("Pink"), value: "#c94f8f" },
  { name: msg("Red"), value: "#d44c47" },
]
const BACKGROUND_COLORS = [
  { name: msg("Gray"), value: "rgba(138, 138, 133, 0.22)" },
  { name: msg("Brown"), value: "rgba(160, 105, 79, 0.22)" },
  { name: msg("Orange"), value: "rgba(217, 115, 13, 0.22)" },
  { name: msg("Yellow"), value: "rgba(234, 190, 40, 0.32)" },
  { name: msg("Green"), value: "rgba(63, 148, 104, 0.22)" },
  { name: msg("Blue"), value: "rgba(47, 134, 196, 0.22)" },
  { name: msg("Purple"), value: "rgba(144, 101, 176, 0.22)" },
  { name: msg("Pink"), value: "rgba(201, 79, 143, 0.22)" },
  { name: msg("Red"), value: "rgba(212, 76, 71, 0.22)" },
]

function ColorButton({
  nodeType,
  label,
  icon: Icon,
  colors,
}: {
  nodeType: string
  label: string
  icon: LucideIcon
  colors: { name: string; value: string }[]
}) {
  const editor = useEditorRef()
  const current = useEditorSelector((ed) => (ed.api.marks()?.[nodeType] as string | undefined) ?? null, [nodeType])
  const [open, setOpen] = React.useState(false)
  // The popover takes focus; put the selection back before changing the mark.
  const saved = React.useRef<TRange | null>(null)
  const apply = (value: string | null) => {
    if (saved.current) editor.tf.select(saved.current)
    editor.tf.focus()
    if (value) editor.tf.addMarks({ [nodeType]: value })
    else editor.tf.removeMarks(nodeType)
    setOpen(false)
  }
  const background = nodeType === KEYS.backgroundColor
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) saved.current = editor.selection
        setOpen(o)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger className={cn(toolButton, "flex-col gap-0 py-0.5")} aria-label={label} onMouseDown={(e) => e.preventDefault()}>
            <Icon className="!size-3.5" />
            <span className="h-[3px] w-4 rounded-full" style={{ background: current ?? "currentColor", opacity: current ? 1 : 0.35 }} />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-auto p-2" onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="grid grid-cols-5 gap-1">
          <button
            type="button"
            title={t("Default")}
            aria-label={t("Default")}
            onClick={() => apply(null)}
            className={cn("grid size-7 place-items-center rounded-md border text-xs hover:bg-accent", !current && "ring-2 ring-ring")}
          >
            {background ? "" : "A"}
          </button>
          {colors.map((c) => (
            <button
              key={c.value}
              type="button"
              title={t(c.name)}
              aria-label={t(c.name)}
              onClick={() => apply(c.value)}
              className={cn("grid size-7 place-items-center rounded-md border text-sm font-medium hover:bg-accent", current === c.value && "ring-2 ring-ring")}
              style={background ? { background: c.value } : { color: c.value }}
            >
              {background ? "" : "A"}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const ALIGNS = [
  { value: "left", label: msg("Align left"), icon: AlignLeft },
  { value: "center", label: msg("Center"), icon: AlignCenter },
  { value: "right", label: msg("Align right"), icon: AlignRight },
  { value: "justify", label: msg("Justify"), icon: AlignJustify },
] as const

function AlignButton() {
  const editor = useEditorRef()
  const value = useSelectionFragmentProp({ defaultValue: "start", getProp: (node) => node.align }) ?? "left"
  const active = ALIGNS.find((a) => a.value === value) ?? ALIGNS[0]
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger className={toolButton} aria-label={t("Align")} onMouseDown={(e) => e.preventDefault()}>
            <active.icon />
            <ChevronDown className="!size-3" />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("Align")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuRadioGroup
          value={active.value}
          onValueChange={(v) => {
            editor.getTransforms(TextAlignPlugin).textAlign.setNodes(v as (typeof ALIGNS)[number]["value"])
            editor.tf.focus()
          }}
        >
          {ALIGNS.map(({ value: v, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={v} value={v} aria-label={t(label)} title={t(label)}>
              <Icon />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ListButton({ style, label, icon: Icon }: { style: "disc" | "decimal"; label: string; icon: LucideIcon }) {
  const editor = useEditorRef()
  const pressed = useEditorSelector((ed) => someList(ed, [style]), [style])
  return (
    <ToolButton label={label} pressed={pressed} onClick={() => toggleList(editor, { listStyleType: style })}>
      <Icon />
    </ToolButton>
  )
}

function TodoButton() {
  const state = useIndentTodoToolBarButtonState({ nodeType: "todo" })
  const { props } = useIndentTodoToolBarButton(state)
  return (
    <ToolButton label={t("To-do list")} pressed={props.pressed} onClick={props.onClick}>
      <ListTodo />
    </ToolButton>
  )
}

function InsertButton({ type, label, icon: Icon }: { type: string; label: string; icon: LucideIcon }) {
  const editor = useEditorRef()
  return (
    <ToolButton
      label={label}
      onClick={() => {
        editor.tf.focus()
        insertBlock(editor, type)
      }}
    >
      <Icon />
    </ToolButton>
  )
}

function ImageButton() {
  const editor = useEditorRef()
  return (
    <ToolButton label={t("Image")} onClick={() => pickImage(editor)}>
      <ImageIcon />
    </ToolButton>
  )
}

function IndentButton() {
  const { props } = useIndentButton()
  return (
    <ToolButton label={t("Indent")} onClick={props.onClick}>
      <IndentIncrease />
    </ToolButton>
  )
}

function OutdentButton() {
  const { props } = useOutdentButton()
  return (
    <ToolButton label={t("Outdent")} onClick={props.onClick}>
      <IndentDecrease />
    </ToolButton>
  )
}
