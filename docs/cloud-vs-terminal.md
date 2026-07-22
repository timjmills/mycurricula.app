# When to use the Cloud vs the Terminal

A quick reference for deciding where a task should run. The terminal agent (here)
will **flag cloud-worthy tasks with 🌩️** and point you at this file — when you see
that flag, this doc tells you why and how to run it in the cloud.

Default: **do it here (terminal).** The two things that gate quality on this
project — **real Codex (§4a code review)** and **live browser testing (§4b)** —
only exist on the terminal. The terminal can also build unattended, run parallel
agent teams, and run ultracode-style workflows. So most work, including planning,
is best done here.

---

## 🌩️ Send it to the cloud when ANY of these is true

- [ ] **You'll be away for hours and want your machine free / laptop closed.**
  The terminal session needs this computer on. The cloud is a hosted box that
  keeps running while your laptop sleeps. → *"Kick off Friday, check Monday."*
- [ ] **Very large parallel fan-out** — a whole-repo audit, a mass migration
  across hundreds of files, or dozens of agents at once. The cloud has its own
  compute; the terminal shares this machine's cores (workflows cap ~14 at once).
- [ ] **Risky or throwaway experiment** you want isolated from the real
  workspace — an ephemeral box you can trash with zero risk to local files.
- [ ] **Big pure-text research/planning grind that does NOT need live-verify or
  Codex** — e.g. "read these 40 books and mine quotes," "survey the whole
  codebase and map it." Run it unattended in the cloud, then bring the result
  back here to implement.

**Rule of thumb:** *heavy, isolated, or long-and-unattended-while-you're-gone,
and doesn't need to touch the running app or pass Codex* → cloud.

---

## ✅ Keep it here (terminal) when ANY of these is true

- [ ] The task **touches the running app** — UI, drag/drop, toasts, responsive,
  anything you need to *see work* (§4b live QA lives here).
- [ ] The change needs the **real Codex §4a gate** (logic, security, data
  handling, public interfaces). The cloud's substitute review agent has missed
  blocking bugs that real Codex caught.
- [ ] You want a **tight fix → verify loop** (fix, re-test, repeat in minutes).
- [ ] **Planning you'll implement soon** — plan it here so the plan gets Codex
  eyes and can be checked against the real app immediately.

**Rule of thumb:** *needs to touch the running app or pass Codex* → terminal.

---

## The one-line test

> **Which environment can catch the bugs before they stack?**
> For this app that's usually the terminal (real Codex + live browser).
> Reach for the cloud when the win is **scale, isolation, or unattended-while-away**
> and live-verify isn't needed.

---

## How to run a flagged task in the cloud

1. Open a Claude Code **web session** (claude.ai/code) on this repo.
2. Paste the task. For a big multi-agent job, include the keyword **`ultracode`**
   to opt into heavy orchestration.
3. When it's done, have it **commit + push** (or hand back a `git bundle`), then
   bring the result **here** to implement, gate (Codex + live QA), and land.

> ⚠️ The cloud **cannot live-test this app** — its container lacks the Supabase
> credentials the middleware requires, so every real page is unreachable there.
> That's why anything needing §4b (a real browser) must come back to the terminal.

---

## Wave 3 note (current work)

The rest of Wave 3 (W3.6 finish → W3.7 Day+Year → W3.8x lesson editor + edit
modes) is interaction-heavy UI — **all of it belongs on the terminal.** No
remaining sub-wave is better in the cloud. The next time you'd reach for the
cloud is likely a big **Phase 1B backend/data migration** grind.
