/**
 * The glyphs `components/ui` draws: check marks, chevrons, close, search, the spinner, the toast icons.
 * This is a product file, like the rest of `src/config`: the template ships lucide here and does not
 * edit it after that, so a product can swap the whole set (another icon library, its own registry)
 * without forking a single component.
 *
 * Contract: every export is a component taking `className` (and `strokeWidth`, which an icon may
 * ignore) and rendering one decorative glyph. Components pass size and colour through `className`.
 * A product that replaces this file keeps the names; a template release that needs a new glyph adds
 * it here and says so in CHANGELOG.md.
 */
export {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleIcon,
  CornerDownLeftIcon,
  GripVerticalIcon,
  InfoIcon,
  Loader2Icon,
  MinusIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  SearchIcon,
  Settings2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
