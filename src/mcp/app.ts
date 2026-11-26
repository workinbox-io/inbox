/**
 * Your product's MCP tools and widgets, one module per app area. A new app (files, calendar…) is one
 * file exporting an McpModule (tools, widgets, one line for the model) plus an entry here.
 * Widgets (MCP Apps) live in ./widgets and are bundled into one HTML document when imported with `?widget`.
 * The template never edits this file.
 */
import type { McpModule } from "./define";
import { mailModule } from "./mail";
import { notesModule } from "./notes";
import { contactsModule } from "./contacts";
import { driveModule } from "./drive";
import { calendarModule } from "./calendar";
import { chatModule } from "./chat";
import { workspaceModule } from "./workspace";
import { collectionsModule } from "./collections";

export const appModules: McpModule[] = [mailModule, notesModule, contactsModule, driveModule, calendarModule, chatModule, collectionsModule, workspaceModule];
