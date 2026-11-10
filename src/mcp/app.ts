/**
 * Your product's MCP tools and widgets, one module per app area. A new app (files, calendar…) is one
 * file exporting an McpModule (tools, widgets, one line for the model) plus an entry here.
 * Widgets (MCP Apps) live in ./widgets and are bundled into one HTML document when imported with `?widget`.
 * The template's projects example (./widgets/projects.tsx) is not served: Work Inbox has no projects.
 * The template never edits this file.
 */
import type { McpModule } from "./define";
import { mailModule } from "./mail";
import { notesModule } from "./notes";
import { contactsModule } from "./contacts";

export const appModules: McpModule[] = [mailModule, notesModule, contactsModule];
