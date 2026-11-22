import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { iconCandidates, senderIcon, senderLogo } from "../src/lib/sender-logo"

describe("sender logos", () => {
  it("recognizes service domains and their subdomains using local assets", () => {
    expect(senderLogo(" Notifications@GitHub.com ")).toBe("/logos/senders/github.svg")
    expect(senderLogo("billing@notifications.stripe.com")).toBe("/logos/senders/stripe.svg")
    for (const domain of ["github.com", "stripe.com", "vercel.com", "linear.app", "figma.com", "notion.so", "notion.com", "discord.com", "discordapp.com", "dropbox.com", "cloudflare.com"]) {
      expect(existsSync(`public${senderLogo(`hello@${domain}`)}`)).toBe(true)
    }
  })

  it("keeps generated avatars for people, unknown addresses and lookalike domains", () => {
    for (const address of ["person@gmail.com", "person@example.com", "github.com", "user@fakegithub.com", "user@github.com.evil.example", "user@@github.com", "user@github.com/path"]) {
      expect(senderLogo(address)).toBeUndefined()
    }
  })

  it("asks our server for company favicons, never for free mail", () => {
    expect(senderIcon("a@github.com")).toBe("/logos/senders/github.svg")
    expect(senderIcon("Jan@Acme.co.uk")).toBe("/api/app/favicon?domain=acme.co.uk")
    for (const address of ["a@gmail.com", "a@wp.pl", "user-id-123", "a@localhost", "anna@acme.test", "a@acme-12.example", "a@example.com"]) expect(senderIcon(address)).toBeUndefined()
  })

  it("reads icon links from a homepage head, biggest first, no SVG", () => {
    const html = `<link rel="icon" href="/fav.svg"><link rel="shortcut icon" href="/f.png?v=1&amp;x=2"><link href="https://cdn.x.com/t.png" rel="apple-touch-icon"><link rel="stylesheet" href="/a.css"><link rel="icon" href="javascript:alert(1)">`
    expect(iconCandidates(html, "https://acme.com/en/")).toEqual(["https://cdn.x.com/t.png", "https://acme.com/f.png?v=1&x=2", "https://acme.com/favicon.ico"])
    expect(iconCandidates("", "https://acme.com/")).toEqual(["https://acme.com/favicon.ico"])
  })
})
