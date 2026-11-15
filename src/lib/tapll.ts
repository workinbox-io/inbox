export const TAPLL_EVENTS = {
  signup_started: ["signup", "start"],
  signup_completed: ["signup", "success"],
  signup_failed: ["signup", "failure"],
  domain_check_started: ["domain_setup", "start"],
  domain_check_completed: ["domain_setup", "success"],
  domain_check_failed: ["domain_setup", "failure"],
  mail_send_started: ["mail_send", "start"],
  mail_send_queued: ["mail_send", "success"],
  mail_send_failed: ["mail_send", "failure"],
  note_creation_started: ["notes", "start"],
  note_created: ["notes", "success"],
  note_creation_failed: ["notes", "failure"],
  checkout_started: ["checkout", "start"],
  checkout_completed: ["checkout", "success"],
  checkout_failed: ["checkout", "failure"],
  app_install_started: ["app_install", "start"],
  app_installed: ["app_install", "success"],
  app_install_dismissed: ["app_install", "failure"],
} as const;

export function tapllEvent(event: keyof typeof TAPLL_EVENTS, properties?: Record<string, string | number | boolean>) {
  const [feature, role] = TAPLL_EVENTS[event];
  try {
    window.tapll?.("track", event, properties, { feature, role });
  } catch { /* Analytics must never interrupt the action. */ }
}

export function tapllSessionId(): string | null {
  try {
    const id = window.tapll?.("sessionId");
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}
