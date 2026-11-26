/**
 * "Try the demo" forms (`form[data-demo-steps]`): building the demo org takes a few seconds in one POST, so the button
 * locks and walks through the steps (JSON list in the attribute) until the redirect lands.
 * shortcut: steps are timed, not real progress; stream real stages from createDemoOrg if timings drift a lot.
 */
const STEP_MS = 1400;

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-demo-steps]")) {
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
  if (!button) continue;
  const label = button.innerHTML;
  const steps: string[] = JSON.parse(form.dataset.demoSteps!);
  let timer = 0;
  form.addEventListener("submit", () => {
    let i = 0;
    const show = () => (button.textContent = steps[Math.min(i++, steps.length - 1)]!);
    show();
    timer = window.setInterval(show, STEP_MS);
    // Disabled after the submit event, or the browser drops the button from the form data.
    setTimeout(() => (button.disabled = true));
    button.setAttribute("aria-busy", "true");
  });
  // Back from the app (bfcache): the button again.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    clearInterval(timer);
    button.innerHTML = label;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  });
}
