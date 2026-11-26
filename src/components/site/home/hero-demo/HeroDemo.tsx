import {
  Archive, AtSign, Building2, CalendarClock, CalendarDays, ChevronDown, Clock, Contact, Database, File, FileText, Forward, HardDrive, Inbox,
  Mail, MailOpen, MessagesSquare, MoreHorizontal, NotebookPen, Paperclip, PenLine, Phone, Plus, Reply, Search, Send, ShieldAlert, SlidersHorizontal,
  Star, SquarePen, Trash2,
} from "lucide-react";
import { Avatar, Collapse, Popover, Stage, Toast, Window, type Act } from "@/components/stageshow";
import "./hero-demo.css";

/**
 * The home hero's demo: Anna answers the signed contract in Work Inbox, drawn after the real mail screen
 * (public/marketing/mail-thread-hero.webp: rail, folders, thread list, thread, sender panel). Reply, type, "@" picks the
 * brief from Drive, Send, "Message sent", and Undo puts the thread back (the loop's cause). Built on the stageshow kit
 * (components/stageshow, MIT); the words come from the demo's story through `copy`, so EN and PL match the demo.
 */
export type HeroDemoCopy = {
  compose: string; allMailboxes: string; mailboxes: string; search: string; unread: string;
  folders: { inbox: string; starred: string; snoozed: string; drafts: string; sent: string; outbox: string; archived: string; spam: string; trash: string };
  mailbox: string; from: string; fromEmail: string; subject: string; label: string; body: string[]; attach: string; time: string;
  oneMessage: string; oneFile: string; toLine: string;
  rows: { from: string; subject: string; snippet: string; time: string }[];
  panel: { role: string; phone: string; threads: string; firstMail: string; newMail: string; openContact: string; other: string; onlyOne: string };
  reply: string; forward: string; send: string; to: string;
  typed: string; query: string; after: string;
  mentions: { kind: "file" | "note" | "event"; title: string; hint: string }[];
  me: string; now: string; toast: string; undo: string;
};

type S = { composing: boolean; typed: string; menu: boolean; chip: boolean; after: string; sent: boolean; toast: boolean };
const initial: S = { composing: false, typed: "", menu: false, chip: false, after: "", sent: false, toast: false };

const KIND_ICON = { file: FileText, note: NotebookPen, event: CalendarDays };
const REST = { at: "list", x: 0.6, y: 0.85 };

function script(copy: HeroDemoCopy) {
  return async (a: Act<S>) => {
    await a.wait(900);
    // 1. Reply opens the composer under the message
    await a.click("reply");
    await a.set({ composing: true });
    await a.wait(450);
    // 2. Type, then "@" opens the picker
    await a.move({ at: "editor", x: 0.3, y: 0.4 });
    await a.type("typed", `${copy.typed}@${copy.query}`);
    await a.set({ menu: true });
    await a.wait(700);
    // 3. The brief from Drive becomes a chip where "@" was typed
    await a.click("pick");
    await a.set({ menu: false });
    await a.set({ typed: copy.typed, chip: true });
    await a.wait(300);
    await a.type("after", copy.after);
    await a.wait(500);
    // 4. Send: the reply lands in the thread, the toast rises
    await a.click("send");
    await a.set({ composing: false, sent: true });
    await a.wait(350);
    await a.set({ toast: true });
    await a.wait(2600);
    // 5. Undo brings the thread back: the loop's seam has a cause
    await a.click("undo");
    await a.set({ toast: false, sent: false });
    await a.wait(500);
    await a.set({ ...initial });
    await a.move(REST);
    await a.wait(600);
  };
}

function Chip({ title }: { title: string }) {
  return <span className="hx-chip"><FileText size={12} className="hx-pdf" />{title}</span>;
}

function Folder({ icon: I, label, count, active }: { icon: typeof Inbox; label: string; count?: number; active?: boolean }) {
  return <span className="hx-folder" data-active={active || undefined}><I size={15} />{label}{count ? <b>{count}</b> : null}</span>;
}

export default function HeroDemo({ copy }: { copy: HeroDemoCopy }) {
  const poster: S = { ...initial, sent: true, toast: true, typed: copy.typed, chip: true, after: copy.after };
  const file = copy.mentions[0]!.title;
  const f = copy.folders;
  const tones = ["#8b5cf6", "#8b5cf6", "#22c55e", "#64748b", "#f59e0b", "#64748b"];
  return (
    <Stage width={1380} height={640} initial={initial} poster={poster} script={script(copy)} cursor={{ at: REST }} accent="#2f5bff" greys="cool" fidelity="realistic" className="hx">
      {(s, rect) => (
        <>
          <Window url="workinbox.io/app/mail" urlShape="pill" className="hx-window">
            <div className="hx-app">
              <nav className="hx-rail" aria-hidden>
                <img src="/favicon.svg" alt="" className="hx-logo" />
                <span className="hx-rail__app"><Search size={18} /></span>
                <span className="hx-rail__app" data-active><Mail size={19} /><i>2</i></span>
                <span className="hx-rail__app"><MessagesSquare size={19} /><i>1</i></span>
                {[CalendarDays, SquarePen, Contact, HardDrive, Database].map((I, i) => <span key={i} className="hx-rail__app"><I size={19} /></span>)}
              </nav>

              <aside className="hx-folders">
                <span className="hx-new"><Plus size={15} />{copy.compose}<kbd>c</kbd></span>
                <span className="hx-label">{copy.allMailboxes}</span>
                <Folder icon={Inbox} label={f.inbox} count={2} active />
                <Folder icon={Star} label={f.starred} />
                <Folder icon={Clock} label={f.snoozed} />
                <Folder icon={File} label={f.drafts} count={2} />
                <Folder icon={Send} label={f.sent} />
                <Folder icon={CalendarClock} label={f.outbox} />
                <Folder icon={Archive} label={f.archived} />
                <Folder icon={ShieldAlert} label={f.spam} />
                <Folder icon={Trash2} label={f.trash} />
                <span className="hx-label hx-label--row">{copy.mailboxes}<SlidersHorizontal size={13} /></span>
                <span className="hx-folder"><ChevronDown size={14} /><i className="hx-dot" />{copy.mailbox}</span>
                <span className="hx-folder hx-folder--sub"><Inbox size={15} />{f.inbox}</span>
              </aside>

              <section className="hx-list" data-target="list">
                <div className="hx-list__head"><b>{f.inbox}</b><span>{copy.unread} · {copy.allMailboxes}</span></div>
                <span className="hx-search"><Search size={14} />{copy.search}<kbd>/</kbd></span>
                <div className="hx-row" data-selected style={{ "--tone": "#22c55e" } as React.CSSProperties}>
                  <div className="hx-row__top"><i className="hx-check" /><Avatar name={copy.from} size={18} /><b>{copy.from}</b><MoreHorizontal size={14} className="hx-faint" /></div>
                  <div className="hx-row__subject"><span>{copy.subject}</span><em>{copy.label}</em></div>
                  <div className="hx-row__snippet">{copy.body.join(" ")}</div>
                </div>
                {copy.rows.map((r, i) => (
                  <div key={r.from} className="hx-row" style={{ "--tone": tones[i] } as React.CSSProperties}>
                    <div className="hx-row__top">{i < 2 && <i className="hx-unread" />}<Avatar name={r.from} size={18} /><b>{r.from}</b><time>{r.time}</time></div>
                    <div className="hx-row__subject"><span>{r.subject}</span></div>
                    <div className="hx-row__snippet">{r.snippet}</div>
                  </div>
                ))}
              </section>

              <main className="hx-thread">
                <div className="hx-tools">
                  {[Archive, Clock, Trash2, MailOpen].map((I, i) => <I key={i} size={17} />)}
                  <Star size={17} className="hx-star" />
                  <ShieldAlert size={17} />
                </div>
                <div className="hx-thread__body">
                  <div className="hx-subject">{copy.subject}</div>
                  <div className="hx-meta"><span className="hx-mbox"><i className="hx-dot" />{copy.mailbox}</span><span><MessagesSquare size={13} />{copy.oneMessage}</span><span><Paperclip size={13} />{copy.oneFile}</span></div>
                  <article className="hx-msg">
                    <div className="hx-msg__head">
                      <Avatar name={copy.from} size={34} />
                      <span className="hx-who"><span><b>{copy.from}</b> <small>&lt;{copy.fromEmail}&gt;</small></span><small>{copy.toLine}</small></span>
                      <span className="hx-msg__side"><Paperclip size={13} />1 <time>{copy.time}</time><Reply size={14} /><Forward size={14} /><MoreHorizontal size={14} /></span>
                    </div>
                    {copy.body.map((p, i) => <p key={i}>{p}</p>)}
                    <span className="hx-attach"><span className="hx-attach__tile"><FileText size={16} /></span><span><b>{copy.attach}</b><small>857 B</small></span></span>
                  </article>
                  <Collapse open={s.sent} reveal="drop">
                    <article className="hx-msg">
                      <div className="hx-msg__head">
                        <Avatar name={copy.me} size={34} tone="accent" />
                        <span className="hx-who"><b>{copy.me}</b><small>{copy.to}: {copy.fromEmail}</small></span>
                        <span className="hx-msg__side"><time>{copy.now}</time></span>
                      </div>
                      <p>{copy.typed}<Chip title={file} />{copy.after}</p>
                    </article>
                  </Collapse>
                  <Collapse open={!s.composing && !s.sent}>
                    <div className="hx-actions">
                      <span className="hx-btn" data-target="reply" data-cursor="hand"><Reply size={15} />{copy.reply}</span>
                      <span className="hx-btn"><Forward size={15} />{copy.forward}</span>
                    </div>
                  </Collapse>
                  <Collapse open={s.composing}>
                    <div className="hx-compose">
                      <div className="hx-compose__to"><span>{copy.to}</span><span className="hx-pill">{copy.fromEmail}</span></div>
                      <div className="hx-editor" data-target="editor" data-cursor="ibeam">
                        {s.typed}{s.chip && <Chip title={file} />}{s.after}<span className="hx-caret" data-target="caret" />
                      </div>
                      <div className="hx-compose__foot">
                        <span className="hx-send" data-target="send" data-cursor="hand"><Send size={14} />{copy.send}</span>
                        <Paperclip size={16} className="hx-faint" />
                        <HardDrive size={16} className="hx-faint" />
                        <AtSign size={16} className="hx-faint" />
                      </div>
                    </div>
                  </Collapse>
                </div>
              </main>

              <aside className="hx-panel">
                <div className="hx-panel__who"><Avatar name={copy.from} size={40} /><span className="hx-panel__name"><b>{copy.from}</b><small>{copy.fromEmail.split("@")[1]}</small></span></div>
                <span><Mail size={15} />{copy.fromEmail}</span>
                <span><Building2 size={15} />{copy.panel.role}</span>
                <span><Phone size={15} />{copy.panel.phone}</span>
                <span><MessagesSquare size={15} />{copy.panel.threads}</span>
                <span><CalendarClock size={15} />{copy.panel.firstMail}</span>
                <span><Inbox size={15} /><i className="hx-dot" />{copy.mailbox}</span>
                <span><PenLine size={15} />{copy.panel.newMail}</span>
                <span><Contact size={15} />{copy.panel.openContact}</span>
                <small className="hx-panel__label">{copy.panel.other}</small>
                <small>{copy.panel.onlyOne}</small>
              </aside>
            </div>
          </Window>

          <Popover show={s.menu} className="hx-menu" style={{ left: rect("caret").x - 40, top: rect("caret").y + 24 }}>
            {copy.mentions.map((m, i) => {
              const I = KIND_ICON[m.kind];
              return (
                <span key={m.title} className="hx-menu__row" data-active={i === 0 || undefined} data-target={i === 0 ? "pick" : undefined} data-cursor="hand">
                  <I size={15} className={m.kind === "file" ? "hx-pdf" : "hx-faint"} /><b>{m.title}</b><small>{m.hint}</small>
                </span>
              );
            })}
          </Popover>

          <Toast show={s.toast} className="hx-toast" action={<span className="hx-undo" data-target="undo" data-cursor="hand">{copy.undo}</span>}>
            {copy.toast}
          </Toast>
        </>
      )}
    </Stage>
  );
}
