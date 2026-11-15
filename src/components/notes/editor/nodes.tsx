/**
 * How each node of a note renders in the editor. Kept small and in the app's own styles; the node types
 * match lib/notes/plate.ts (the server-side model).
 */
import * as React from "react"
import { isOrderedList } from "@platejs/list"
import { useTodoListElement, useTodoListElementState } from "@platejs/list/react"
import { getMentionOnSelectItem } from "@platejs/mention"
import type { TComboboxInputElement, TImageElement, TLinkElement, TListElement, TMentionElement } from "platejs"
import { PlateElement, PlateLeaf, useFocused, useReadOnly, useSelected, type PlateElementProps, type PlateLeafProps, type RenderNodeWrapper } from "platejs/react"
import { Checkbox } from "@/components/ui/checkbox"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox"
import { SLASH_GROUPS } from "./transforms"
import { useNotePeople } from "./people"

export const ParagraphElement = (props: PlateElementProps) => <PlateElement {...props} className="m-0 px-0 py-1" />

const heading = (as: "h1" | "h2" | "h3", className: string) =>
  function Heading(props: PlateElementProps) {
    return <PlateElement {...props} as={as} className={cn("font-semibold tracking-tight", className)} />
  }
export const H1Element = heading("h1", "mt-6 mb-1 text-3xl")
export const H2Element = heading("h2", "mt-5 mb-1 text-2xl")
export const H3Element = heading("h3", "mt-4 mb-1 text-xl")

export const BlockquoteElement = (props: PlateElementProps) => (
  <PlateElement {...props} as="blockquote" className="my-1 border-l-2 pl-4 text-muted-foreground italic" />
)

export function HrElement(props: PlateElementProps) {
  const selected = useSelected()
  const focused = useFocused()
  return (
    <PlateElement {...props}>
      <div className="py-4" contentEditable={false}>
        <hr className={cn("h-0.5 rounded-sm border-none bg-muted bg-clip-content", selected && focused && "ring-2 ring-ring ring-offset-2")} />
      </div>
      {props.children}
    </PlateElement>
  )
}

export const CodeBlockElement = (props: PlateElementProps) => (
  <PlateElement {...props} className="my-2">
    <pre className="overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono text-sm leading-relaxed">
      <code>{props.children}</code>
    </pre>
  </PlateElement>
)
export const CodeLineElement = (props: PlateElementProps) => <PlateElement {...props} />

export const CodeLeaf = (props: PlateLeafProps) => (
  <PlateLeaf {...props} as="code" className="rounded-sm bg-muted px-[0.3em] py-[0.2em] font-mono text-sm whitespace-pre-wrap" />
)
export const HighlightLeaf = (props: PlateLeafProps) => <PlateLeaf {...props} as="mark" className="bg-yellow-200/70 text-inherit dark:bg-yellow-500/30" />

export function LinkElement(props: PlateElementProps<TLinkElement>) {
  return (
    <PlateElement
      {...props}
      as="a"
      className="font-medium text-primary underline decoration-primary/40 underline-offset-4"
      attributes={{ ...props.attributes, href: props.element.url, target: "_blank", rel: "noopener noreferrer" }}
    />
  )
}

/** Lists are paragraphs with listStyleType (indent lists): wrap them in ul/ol, todo items get a checkbox. */
export const BlockList: RenderNodeWrapper = (props) => {
  if (!props.element.listStyleType) return
  return (inner) => <List {...inner} />
}

function List(props: PlateElementProps) {
  const { listStart, listStyleType } = props.element as TListElement
  const todo = listStyleType === "todo"
  const Tag = isOrderedList(props.element) ? "ol" : "ul"
  return (
    <Tag className="relative m-0 p-0" style={{ listStyleType: todo ? undefined : listStyleType }} start={listStart}>
      {todo && <TodoMarker {...props} />}
      <li className={cn(todo && "list-none", todo && !!props.element.checked && "text-muted-foreground line-through")}>{props.children}</li>
    </Tag>
  )
}

function TodoMarker(props: PlateElementProps) {
  const state = useTodoListElementState({ element: props.element })
  const { checkboxProps } = useTodoListElement(state)
  const readOnly = useReadOnly()
  return (
    <div contentEditable={false}>
      <Checkbox className={cn("absolute top-1.5 -left-6", readOnly && "pointer-events-none")} {...checkboxProps} />
    </div>
  )
}

export function ImageElement(props: PlateElementProps<TImageElement>) {
  const selected = useSelected()
  const focused = useFocused()
  return (
    <PlateElement {...props} className="my-2">
      <figure contentEditable={false} className="m-0">
        <img
          src={props.element.url}
          alt=""
          className={cn("max-h-[480px] max-w-full rounded-md border object-contain", selected && focused && "ring-2 ring-ring ring-offset-2")}
        />
      </figure>
      {props.children}
    </PlateElement>
  )
}

export const TableElement = (props: PlateElementProps) => (
  <PlateElement {...props} className="my-3 overflow-x-auto">
    <table className="w-full border-collapse text-sm">
      <tbody>{props.children}</tbody>
    </table>
  </PlateElement>
)
export const TableRowElement = (props: PlateElementProps) => <PlateElement {...props} as="tr" />
export const TableCellElement = (props: PlateElementProps) => (
  <PlateElement {...props} as="td" className="min-w-24 border px-3 py-1.5 align-top" />
)
export const TableCellHeaderElement = (props: PlateElementProps) => (
  <PlateElement {...props} as="th" className="min-w-24 border bg-muted/50 px-3 py-1.5 text-left align-top font-semibold" />
)

export function MentionElement(props: PlateElementProps<TMentionElement>) {
  const selected = useSelected()
  const focused = useFocused()
  return (
    <PlateElement
      {...props}
      className={cn("inline-block rounded-md bg-primary/10 px-1.5 py-0.5 align-baseline text-sm font-medium text-primary", selected && focused && "ring-2 ring-ring")}
      attributes={{ ...props.attributes, contentEditable: false, "data-slate-value": props.element.value, draggable: true }}
    >
      @{props.element.value}
      {props.children}
    </PlateElement>
  )
}

const onSelectMention = getMentionOnSelectItem()

export function MentionInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props
  const [search, setSearch] = React.useState("")
  const people = useNotePeople()
  return (
    <PlateElement {...props} as="span">
      <InlineCombobox value={search} element={element} setValue={setSearch} showTrigger={false} trigger="@">
        <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm">
          @<InlineComboboxInput />
        </span>
        <InlineComboboxContent className="my-1.5">
          <InlineComboboxEmpty>{t("No people found")}</InlineComboboxEmpty>
          <InlineComboboxGroup>
            {people.map((p) => (
              <InlineComboboxItem key={p.id} value={p.name} keywords={[p.email]} onClick={() => onSelectMention(editor, { key: p.id, text: p.name }, search)}>
                <span className="truncate">{p.name}</span>
                <span className="ml-2 truncate text-xs text-muted-foreground">{p.email}</span>
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>
      {props.children}
    </PlateElement>
  )
}

export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props
  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />
        <InlineComboboxContent>
          <InlineComboboxEmpty>{t("No results")}</InlineComboboxEmpty>
          {SLASH_GROUPS.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <div className="mt-1.5 mb-1 px-3 text-xs font-medium text-muted-foreground">{t(group)}</div>
              {items.map(({ icon: Icon, keywords, label, value, onSelect }) => (
                <InlineComboboxItem key={value} value={value} label={t(label)} keywords={keywords} group={group} onClick={() => onSelect(editor, value)}>
                  <Icon className="mr-2 text-muted-foreground" />
                  {t(label)}
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
