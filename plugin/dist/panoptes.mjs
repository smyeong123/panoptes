#!/usr/bin/env node

// server/cli.ts
import { spawn } from "node:child_process";
import path4 from "node:path";
import { fileURLToPath } from "node:url";

// server/app.ts
import fs4 from "node:fs";
import http from "node:http";
import path3 from "node:path";

// server/collisions.ts
import fs from "node:fs";
import path from "node:path";

// shared/rooms.ts
var ROOM_BY_TOOL = {
  Read: "library",
  Grep: "library",
  Glob: "library",
  LS: "library",
  NotebookRead: "library",
  Edit: "dev",
  Write: "dev",
  MultiEdit: "dev",
  NotebookEdit: "dev",
  Bash: "server",
  PowerShell: "server",
  BashOutput: "server",
  KillShell: "server",
  KillBash: "server",
  Monitor: "server",
  TaskStop: "server",
  TaskOutput: "server",
  EnterWorktree: "server",
  ExitWorktree: "server",
  WebSearch: "search",
  WebFetch: "search",
  ToolSearch: "search",
  ListMcpResourcesTool: "search",
  ReadMcpResourceTool: "search",
  TodoWrite: "meeting",
  TaskCreate: "meeting",
  TaskUpdate: "meeting",
  TaskList: "meeting",
  TaskGet: "meeting",
  EnterPlanMode: "meeting",
  Skill: "meeting",
  AskUserQuestion: "user",
  ExitPlanMode: "user",
  Agent: "desk",
  Task: "desk",
  SendMessage: "desk"
};
function roomForTool(name) {
  if (name.startsWith("mcp__")) return "search";
  return ROOM_BY_TOOL[name] ?? "desk";
}

// server/redact.ts
var PATTERNS = [
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ["aws-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ["api-key", /\b(?:sk|pk|rk)-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g],
  ["google-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ["bearer", /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi],
  ["url-credentials", /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi],
  [
    "assignment",
    /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|APIKEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*([=:])\s*("[^"\n]*"|'[^'\n]*'|[^\s'"]+)/gi
  ]
];
function redact(text) {
  let out = text;
  for (const [name, re] of PATTERNS) {
    out = out.replace(re, (...m) => {
      if (name === "bearer") return `${m[1]} [REDACTED]`;
      if (name === "url-credentials") return `${m[1]}[REDACTED]@`;
      if (name === "assignment") return `${m[1]}${m[2]}[REDACTED]`;
      return `[REDACTED:${name}]`;
    });
  }
  return out;
}

// server/parse.ts
function clip(s, n) {
  const t = redact(String(s ?? "")).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "\u2026" : t;
}
function basename(p) {
  return String(p ?? "").split(/[\\/]/).filter(Boolean).pop() ?? "";
}
function summarize(name, input) {
  if (!input || typeof input !== "object") return name;
  switch (name) {
    case "Read":
    case "Edit":
    case "Write":
    case "MultiEdit":
    case "NotebookEdit":
    case "NotebookRead":
      return basename(input.file_path ?? input.notebook_path);
    case "Grep":
    case "Glob":
      return clip(input.pattern, 40);
    case "Bash":
    case "PowerShell":
      return clip(input.description || input.command, 60);
    case "WebSearch":
      return clip(input.query, 50);
    case "WebFetch":
      try {
        return new URL(input.url).hostname;
      } catch {
        return "WebFetch";
      }
    case "AskUserQuestion":
      return clip(input.questions?.[0]?.question ?? "", 60);
    case "ExitPlanMode":
      return "";
    // 문구는 화면 언어에 맞춰 브라우저가 채운다
    case "TaskCreate":
      return clip(input.subject, 40);
    case "Skill":
      return clip(input.skill, 40);
    case "SendMessage":
      return clip(input.to, 30);
  }
  if (name.startsWith("mcp__")) return name.split("__").slice(1).join(" \xB7 ");
  return name;
}
function boardLines(name, input) {
  if (name === "TodoWrite" && Array.isArray(input?.todos)) {
    const mark = { completed: "\u2714", in_progress: "\u25B6", pending: "\u25A1" };
    return input.todos.slice(0, 7).map((t) => `${mark[t.status] ?? "\u25A1"} ${clip(t.content, 34)}`);
  }
  if (name === "TaskCreate" && input?.subject) return [`\u25A1 ${clip(input.subject, 34)}`];
  if (name === "ExitPlanMode" && typeof input?.plan === "string") {
    return input.plan.split("\n").filter((l) => /^#{1,3}\s/.test(l)).slice(0, 7).map((l) => clip(l.replace(/^#+\s*/, ""), 36));
  }
  return void 0;
}
var CODEX_EXEC_RE = /(^|[\s;&|(])codex\s+(?:exec|e)(\s|$)/;
function codexHandoff(name, input) {
  if (name.startsWith("mcp__codex")) return clip(input?.prompt ?? "", 40);
  if (name !== "Bash" && name !== "PowerShell") return null;
  const cmd = String(input?.command ?? "");
  if (!CODEX_EXEC_RE.test(cmd)) return null;
  const rest = cmd.replace(/^[\s\S]*?codex\s+(?:exec|e)\s+/, "");
  const quoted = /(["'])([\s\S]*?)\1/.exec(rest);
  return clip(quoted ? quoted[2] : rest.replace(/^(?:-{1,2}[\w-]+\s+)*/, ""), 40);
}
function isGit(name, input) {
  return (name === "Bash" || name === "PowerShell") && /(^|[\s;&|(])git\s/.test(String(input?.command ?? ""));
}
function toolResultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => c?.type === "text" ? c.text : "").join(" ");
  return "";
}
var NOTIFY_RE = /<task-notification>[\s\S]*?<tool-use-id>([^<]+)<\/tool-use-id>[\s\S]*?<status>([^<]+)<\/status>/;
function notification(text, ts) {
  const m = NOTIFY_RE.exec(text);
  if (!m || m[2].trim() === "running") return [];
  return [{ k: "agentDone", ts, agent: "main", toolUseId: m[1].trim() }];
}
var TEAMMATE_RE = /<teammate-message teammate_id="([^"]+)"[^>]*>\s*(\{[\s\S]*?\})\s*<\/teammate-message>/g;
function teammateIdle(text, ts) {
  const out = [];
  for (const m of text.matchAll(TEAMMATE_RE)) {
    let o;
    try {
      o = JSON.parse(m[2]);
    } catch {
      continue;
    }
    if (o?.type !== "idle_notification") continue;
    out.push({ k: "teammateIdle", ts: Date.parse(o.timestamp) || ts, agent: "main", name: String(o.from || m[1]) });
  }
  return out;
}
function parseLine(line, agent = "main") {
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return [];
  }
  if (!o || typeof o !== "object") return [];
  const ts = Date.parse(o.timestamp) || Date.now();
  const isSub = agent !== "main";
  if (o.type === "queue-operation") {
    if (o.operation === "enqueue" && typeof o.content === "string") return notification(o.content, ts);
    return [];
  }
  if (o.type === "system") {
    return o.subtype === "turn_duration" ? [{ k: "turnEnd", ts, agent }] : [];
  }
  if (o.type === "assistant") {
    const content = o.message?.content;
    if (!Array.isArray(content)) return [];
    const out = [];
    let usedTool = false;
    for (const c of content) {
      if (c?.type === "thinking") {
        out.push({ k: "think", ts, agent, text: clip(c.thinking, 90) });
      } else if (c?.type === "text") {
        const text = clip(c.text, 70);
        if (text) out.push({ k: "say", ts, agent, text });
      } else if (c?.type === "tool_use") {
        usedTool = true;
        const name = String(c.name);
        const input = c.input ?? {};
        const handoff = codexHandoff(name, input);
        out.push({
          k: "tool",
          ts,
          agent,
          id: String(c.id),
          name,
          room: roomForTool(name),
          label: summarize(name, input),
          git: isGit(name, input) || void 0,
          board: boardLines(name, input),
          ...handoff !== null ? { room: "desk", call: true } : {}
        });
        if (handoff !== null) {
          out.push({ k: "spawn", ts, agent, toolUseId: String(c.id), subagentType: "Codex", description: handoff });
        }
        if (name === "Agent" || name === "Task") {
          out.push({
            k: "spawn",
            ts,
            agent,
            toolUseId: String(c.id),
            subagentType: String(input.subagent_type || "general-purpose"),
            description: clip(input.description, 40)
          });
        }
      }
    }
    if (isSub && !usedTool && o.message?.stop_reason === "end_turn") out.push({ k: "turnEnd", ts, agent });
    return out;
  }
  if (o.type === "user") {
    if (o.isMeta || o.isCompactSummary) return [];
    const content = o.message?.content;
    if (typeof content === "string") {
      if (content.includes("<task-notification>")) return notification(content, ts);
      if (content.includes("<teammate-message")) return isSub ? [] : teammateIdle(content, ts);
      if (isSub || content.startsWith("<") || content.startsWith("This session is being continued")) return [];
      const text = clip(content, 60);
      return text ? [{ k: "prompt", ts, agent, text }] : [];
    }
    if (!Array.isArray(content)) return [];
    const out = [];
    const tur = o.toolUseResult;
    const teammate = !!tur && typeof tur === "object" && tur.status === "teammate_spawned";
    const async = teammate || !!tur && typeof tur === "object" && (tur.isAsync === true || tur.status === "async_launched" || !!tur.backgroundTaskId);
    for (const c of content) {
      if (c?.type === "tool_result") {
        if (teammate && (tur.agentId || tur.agent_id)) {
          out.push({
            k: "teammate",
            ts,
            agent,
            toolUseId: String(c.tool_use_id),
            agentId: String(tur.agentId || tur.agent_id),
            name: String(tur.name ?? "")
          });
        }
        const error = c.is_error === true;
        out.push({
          k: "toolDone",
          ts,
          agent,
          id: String(c.tool_use_id),
          error,
          errText: error ? clip(toolResultText(c.content), 60) : void 0,
          async: async || void 0
        });
      } else if (c?.type === "text" && !isSub) {
        const text = clip(c.text, 60);
        if (text.includes("<task-notification>")) out.push(...notification(c.text, ts));
        else if (c.text.includes("<teammate-message")) out.push(...teammateIdle(c.text, ts));
        else if (text && !text.startsWith("<")) out.push({ k: "prompt", ts, agent, text });
      }
    }
    return out;
  }
  return [];
}

// server/parseCodex.ts
function patchFiles(text) {
  return [...text.matchAll(/\*\*\* (?:Update|Add|Delete) File: ([^\n\\]+)/g)].map((m) => m[1].trim()).filter(Boolean);
}
function stripShellWrapper(cmd) {
  return cmd.replace(/^(bash|zsh|sh)\s+-l?c\s+/, "").replace(/^(['"])([\s\S]*)\1$/, "$2");
}
function commandOf(args) {
  const c = args?.command ?? args?.cmd;
  if (Array.isArray(c)) return c.join(" ");
  return typeof c === "string" ? c : void 0;
}
function userText(p) {
  const content = Array.isArray(p.content) ? p.content : [];
  const kinds = p.internal_chat_message_metadata_passthrough?.content_item_kinds;
  const picked = Array.isArray(kinds) ? content.filter((_, i) => kinds[i] === "user.text") : content.filter((c) => !/^\s*(<|# AGENTS\.md)/.test(String(c?.text ?? "")));
  return picked.map((c) => c?.text ?? "").join(" ");
}
var SCRIPT_CALL_RE = /tools\.(\w+)\(\s*\{([\s\S]*?)\}\s*\)/g;
var CMD_RE = /\bcmd\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)/;
function unquote(s) {
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
    }
  }
  return s.slice(1, -1);
}
function scriptTool(ts, agent, id, input) {
  const calls = [...input.matchAll(SCRIPT_CALL_RE)];
  const extra = calls.length > 1 ? ` (+${calls.length - 1})` : "";
  const first = calls[0];
  if (!first) return { k: "tool", ts, agent, id, name: "exec", room: "server", label: clip(input, 60) };
  const cmd = CMD_RE.exec(first[2]);
  if (/^(exec_command|shell|local_shell)$/.test(first[1]) && cmd) {
    const ev = shellTool(ts, agent, id, unquote(cmd[1]));
    return extra && ev.k === "tool" ? { ...ev, label: clip(ev.label + extra, 60) } : ev;
  }
  const name = first[1];
  return { k: "tool", ts, agent, id, name, room: roomForTool(name), label: clip(name + extra, 40) };
}
function shellTool(ts, agent, id, cmd) {
  const bare = stripShellWrapper(cmd);
  return { k: "tool", ts, agent, id, name: "Bash", room: "server", label: clip(bare, 60), git: isGit("Bash", { command: bare }) || void 0 };
}
function patchTool(ts, agent, id, text) {
  const files = patchFiles(text).map(basename);
  return { k: "tool", ts, agent, id, name: "Edit", room: "dev", label: clip(files.join(", ") || "patch", 40) };
}
function outputError(raw) {
  if (Array.isArray(raw)) raw = raw.map((c) => typeof c?.text === "string" ? c.text : "").join("\n");
  let text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  let code;
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (o && typeof o === "object") {
      if (typeof o.output === "string") text = o.output;
      if (typeof o.metadata?.exit_code === "number") code = o.metadata.exit_code;
    }
  } catch {
  }
  if (code === void 0) {
    const m = /(?:Process exited with code|Exit code:?|exit_code"?:)\s*(\d+)/i.exec(text);
    if (m) code = Number(m[1]);
  }
  const failed = /^Script (?:failed|error)/im.test(text);
  const body = text.replace(/^(Script \w+|Wall time [^\n]*|Output:)\s*$/gim, "").trim();
  return { error: failed || code !== void 0 && code !== 0, text: body || text };
}
function parseCodexLine(line, agent = "main") {
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return [];
  }
  if (!o || typeof o !== "object") return [];
  const ts = Date.parse(o.timestamp) || Date.now();
  if (o.type === "event_msg") {
    return o.payload?.type === "task_complete" ? [{ k: "turnEnd", ts, agent }] : [];
  }
  const p = o.type === "response_item" ? o.payload : o.payload === void 0 ? o : null;
  if (!p || typeof p !== "object") return [];
  switch (p.type) {
    case "message": {
      if (p.role === "user") {
        if (agent !== "main") return [];
        const text = clip(userText(p), 60);
        return text ? [{ k: "prompt", ts, agent, text }] : [];
      }
      if (p.role === "assistant") {
        const text = clip((Array.isArray(p.content) ? p.content : []).map((c) => c?.text ?? "").join(" "), 70);
        return text ? [{ k: "say", ts, agent, text }] : [];
      }
      return [];
    }
    case "reasoning": {
      const summary = (Array.isArray(p.summary) ? p.summary : []).map((s) => s?.text ?? "").join(" ");
      return [{ k: "think", ts, agent, text: clip(summary, 90) }];
    }
    case "function_call": {
      const id = String(p.call_id ?? p.id);
      let args = p.arguments;
      try {
        args = typeof args === "string" ? JSON.parse(args) : args;
      } catch {
      }
      const raw = typeof args === "string" ? args : JSON.stringify(args ?? {});
      if (raw.includes("*** Begin Patch")) return [patchTool(ts, agent, id, typeof args?.input === "string" ? args.input : raw)];
      const cmd = commandOf(args);
      if (cmd) return [shellTool(ts, agent, id, cmd)];
      const name = String(p.name ?? "tool");
      return [{ k: "tool", ts, agent, id, name, room: roomForTool(name), label: name.startsWith("mcp__") ? name.split("__").slice(1).join(" \xB7 ") : clip(name, 40) }];
    }
    case "local_shell_call":
      return [shellTool(ts, agent, String(p.call_id ?? p.id), commandOf(p.action) ?? "")];
    case "custom_tool_call": {
      const id = String(p.call_id ?? p.id);
      const input = String(p.input ?? "");
      if (p.name === "apply_patch" || input.includes("*** Begin Patch")) return [patchTool(ts, agent, id, input)];
      if (p.name === "exec" || input.includes("tools.")) return [scriptTool(ts, agent, id, input)];
      const name = String(p.name ?? "tool");
      return [{ k: "tool", ts, agent, id, name, room: roomForTool(name), label: clip(name, 40) }];
    }
    case "web_search_call": {
      const id = String(p.id ?? p.call_id ?? ts);
      return [
        { k: "tool", ts, agent, id, name: "WebSearch", room: "search", label: clip(p.action?.query ?? "", 50) },
        { k: "toolDone", ts, agent, id, error: false }
      ];
    }
    case "function_call_output":
    case "custom_tool_call_output":
    case "local_shell_call_output": {
      const { error, text } = outputError(p.output);
      return [{ k: "toolDone", ts, agent, id: String(p.call_id ?? p.id), error, errText: error ? clip(text, 60) : void 0 }];
    }
  }
  return [];
}

// server/collisions.ts
var COLLISION_WINDOW_MS = 10 * 6e4;
var TAIL_BYTES = 256 * 1024;
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
function editsFromText(text, cwd = "") {
  const out = [];
  for (const line of text.split("\n")) {
    const patch = line.includes("*** Begin Patch");
    if (!patch && !line.includes('"tool_use"')) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (patch && o?.type === "response_item") {
      const p = o.payload ?? {};
      const body = typeof p.input === "string" ? p.input : String(p.arguments ?? "");
      const ts2 = Date.parse(o.timestamp) || 0;
      for (const f of patchFiles(body.replace(/\\n/g, "\n"))) out.push({ path: path.resolve(cwd, f), ts: ts2 });
      continue;
    }
    if (o?.type !== "assistant" || !Array.isArray(o.message?.content)) continue;
    const ts = Date.parse(o.timestamp) || 0;
    for (const c of o.message.content) {
      if (c?.type !== "tool_use" || !EDIT_TOOLS.has(c.name)) continue;
      const p = c.input?.file_path ?? c.input?.notebook_path;
      if (typeof p === "string" && p) out.push({ path: path.resolve(p), ts });
    }
  }
  return out;
}
function findCollisions(editors, now, windowMs = COLLISION_WINDOW_MS) {
  const byPath = /* @__PURE__ */ new Map();
  for (const e of editors) {
    const latest = /* @__PURE__ */ new Map();
    for (const ed of e.edits) {
      if (now - ed.ts > windowMs) continue;
      latest.set(ed.path, Math.max(latest.get(ed.path) ?? 0, ed.ts));
    }
    for (const [p, ts] of latest) {
      const list = byPath.get(p) ?? [];
      list.push({ dir: e.dir, id: e.id, agent: e.agent, ts });
      byPath.set(p, list);
    }
  }
  const out = [];
  for (const [p, list] of byPath) {
    const sessions = new Set(list.map((x) => `${x.dir}/${x.id}`));
    const subsBySession = /* @__PURE__ */ new Map();
    for (const x of list) {
      if (x.agent === "main") continue;
      const k = `${x.dir}/${x.id}`;
      subsBySession.set(k, (subsBySession.get(k) ?? 0) + 1);
    }
    if (sessions.size < 2 && ![...subsBySession.values()].some((n) => n > 1)) continue;
    out.push({ path: p, editors: list.sort((a, b) => a.ts - b.ts) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
function readTail(file, size) {
  const start = Math.max(0, size - TAIL_BYTES);
  const buf = Buffer.alloc(size - start);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buf, 0, buf.length, start);
  } finally {
    fs.closeSync(fd);
  }
  return buf.toString("utf8");
}
var CollisionTracker = class {
  constructor(sessionFile2) {
    this.sessionFile = sessionFile2;
  }
  sessionFile;
  cache = /* @__PURE__ */ new Map();
  load(file, agent, now, cwd = "") {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      this.cache.delete(file);
      return null;
    }
    if (now - st.mtimeMs > COLLISION_WINDOW_MS) return null;
    const hit = this.cache.get(file);
    if (hit && hit.mtime === st.mtimeMs) return hit;
    let edits = [];
    try {
      edits = editsFromText(readTail(file, st.size), cwd);
    } catch {
    }
    const c = { mtime: st.mtimeMs, agent: hit && !hit.agent.startsWith("agent:") ? hit.agent : agent(), edits };
    this.cache.set(file, c);
    return c;
  }
  update(floors, now = Date.now()) {
    const editors = [];
    const seen = /* @__PURE__ */ new Set();
    for (const f of floors) {
      for (const s of f.sessions) {
        if (now - s.mtime > COLLISION_WINDOW_MS) continue;
        const main = this.sessionFile(f.dir, s.id);
        seen.add(main);
        const m = this.load(main, () => "main", now, f.cwd);
        if (m?.edits.length) editors.push({ dir: f.dir, id: s.id, agent: "main", edits: m.edits });
        const subDir = path.join(path.dirname(main), s.id, "subagents");
        let names = [];
        try {
          names = fs.readdirSync(subDir).filter((n) => n.endsWith(".jsonl"));
        } catch {
        }
        for (const n of names) {
          const file = path.join(subDir, n);
          seen.add(file);
          const c = this.load(file, () => subagentKey(file, n), now);
          if (c?.edits.length) editors.push({ dir: f.dir, id: s.id, agent: c.agent, edits: c.edits });
        }
      }
    }
    for (const k of this.cache.keys()) if (!seen.has(k)) this.cache.delete(k);
    return findCollisions(editors, now);
  }
};
function subagentKey(file, name) {
  try {
    const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8"));
    if (meta?.toolUseId) return String(meta.toolUseId);
  } catch {
  }
  return `agent:${name.replace(/^agent-/, "").replace(/\.jsonl$/, "")}`;
}

// server/host.ts
import net from "node:net";
var HOST_HEADER = /^(?:\[([0-9a-f:.]+)\]|([a-z0-9.-]+))(?::\d+)?$/i;
var FORBIDDEN_HOST = "Forbidden host. Open Panoptes by IP address or as localhost.";
function isLocalHost(header, extra = []) {
  const match = header ? HOST_HEADER.exec(header) : null;
  if (!match) return false;
  const name = (match[1] ?? match[2]).toLowerCase();
  return name === "localhost" || net.isIP(name) !== 0 || extra.some((host) => host.toLowerCase() === name);
}

// server/watcher.ts
import fs3 from "node:fs";
import os from "node:os";
import path2 from "node:path";

// server/git.ts
import { execFile } from "node:child_process";
import fs2 from "node:fs";
function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, timeout: 5e3, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" } },
      (err, stdout) => err ? reject(err) : resolve(stdout)
    );
  });
}
async function gitSnapshot(cwd) {
  if (!cwd || !fs2.existsSync(cwd)) return null;
  let status2;
  try {
    status2 = await git(cwd, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]);
  } catch {
    return null;
  }
  let branch = "";
  let sha = "";
  let ahead = 0;
  let behind = 0;
  let dirty = 0;
  for (const line of status2.split("\n")) {
    if (!line) continue;
    if (!line.startsWith("# ")) {
      dirty++;
      continue;
    }
    const [key, ...rest] = line.slice(2).split(" ");
    if (key === "branch.head") branch = rest.join(" ");
    else if (key === "branch.oid") sha = rest[0] === "(initial)" ? "" : rest[0];
    else if (key === "branch.ab") {
      ahead = Math.abs(Number(rest[0]) || 0);
      behind = Math.abs(Number(rest[1]) || 0);
    }
  }
  if (branch === "(detached)") branch = sha ? `detached@${sha.slice(0, 7)}` : "detached";
  let subject = "";
  if (sha) {
    try {
      subject = (await git(cwd, ["log", "-1", "--format=%s"])).trim();
    } catch {
    }
  }
  return { branch, dirty, ahead, behind, head: sha ? { sha: sha.slice(0, 7), subject } : null };
}

// server/watcher.ts
var PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR || path2.join(os.homedir(), ".claude", "projects");
var CODEX_SESSIONS_DIR = path2.join(process.env.CODEX_HOME || path2.join(os.homedir(), ".codex"), "sessions");
function encodeCwd(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}
var SCAN_MS = 1e3;
var TAIL_MS = 250;
var RECENT_MS = 24 * 36e5;
var HANDOFF_CHUNK = 4 * 1024 * 1024;
var TOOL_RESULT_ID_RE = /"tool_use_id":"([^"]+)"/;
var REPLAY_BYTES = 8 * 1024 * 1024;
var REPLAY_MAX_EVENTS = 4e3;
var META_WAIT_MS = 3e3;
var GIT_ACTIVE_MS = 5e3;
var GIT_IDLE_MS = 6e4;
var LIVE_MS = 15e3;
function readSlice(file, start, end) {
  const len = Math.max(0, end - start);
  const buf = Buffer.alloc(len);
  if (!len) return buf;
  const fd = fs3.openSync(file, "r");
  try {
    let read = 0;
    while (read < len) {
      const n = fs3.readSync(fd, buf, read, len - read, start + read);
      if (n <= 0) break;
      read += n;
    }
    return buf.subarray(0, read);
  } finally {
    fs3.closeSync(fd);
  }
}
function statOrNull(p) {
  try {
    return fs3.statSync(p);
  } catch {
    return null;
  }
}
function lastMatch(text, re) {
  let m;
  let last;
  re.lastIndex = 0;
  while (m = re.exec(text)) last = m[1];
  return last;
}
function unescapeJson(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}
var GitPoller = class {
  constructor(onChange) {
    this.onChange = onChange;
  }
  onChange;
  cache = /* @__PURE__ */ new Map();
  busy = false;
  get(cwd) {
    return this.cache.get(cwd)?.info ?? void 0;
  }
  /** 활동 중인 층은 5초, 아닌 층은 60초마다 새로 읽는다 */
  refresh(targets) {
    if (this.busy) return;
    const now = Date.now();
    const due = targets.filter((t) => {
      if (!t.cwd) return false;
      const e = this.cache.get(t.cwd);
      return !e || now - e.at >= (t.live ? GIT_ACTIVE_MS : GIT_IDLE_MS);
    });
    if (!due.length) return;
    this.busy = true;
    void (async () => {
      let changed = false;
      for (const { cwd } of due) {
        const info = await gitSnapshot(cwd).catch(() => null);
        const json = JSON.stringify(info);
        if (this.cache.get(cwd)?.json !== json) changed = true;
        this.cache.set(cwd, { info, at: Date.now(), json });
      }
      this.busy = false;
      if (changed) this.onChange();
    })();
  }
};
var LINK_BEFORE_MS = 5e3;
var LINK_AFTER_MS = 10 * 6e4;
var CODEX_DAY_DIRS = 7;
var CodexIndex = class {
  byFile = /* @__PURE__ */ new Map();
  byId = /* @__PURE__ */ new Map();
  // Claude 호출(tool_use id) ↔ 그 호출로 시작된 Codex 세션. 서버가 떠 있는 동안 유지한다.
  links = /* @__PURE__ */ new Map();
  linked = /* @__PURE__ */ new Set();
  // 층 스캐너가 Claude 기록에서 찾은, 아직 짝이 없는 codex 호출
  pending = /* @__PURE__ */ new Map();
  /** 아직 짝을 기다리는 codex 호출인지 */
  isPending(toolUseId) {
    return this.pending.has(toolUseId);
  }
  /** Claude 기록에서 찾은 codex 호출을 올려 둔다. 다음 scan()에서 짝을 찾는다. */
  addHandoff(toolUseId, ts, cwd) {
    if (!this.links.has(toolUseId) && !this.pending.has(toolUseId)) this.pending.set(toolUseId, { ts, cwd });
  }
  /** 올려 둔 codex 호출이 끝났다. 그 뒤에 시작한 Codex 세션은 이 호출의 것이 아니다. */
  handoffDone(toolUseId, end) {
    const h = this.pending.get(toolUseId);
    if (h) h.end = end;
  }
  get(id) {
    return this.byId.get(id);
  }
  isLinked(codexId) {
    return this.linked.has(codexId);
  }
  /**
   * Claude의 codex 호출(toolUseId, ts, cwd)에 맞는 Codex 세션을 찾아 묶는다.
   * 호출 직후에 시작했고 아직 다른 호출에 묶이지 않은 세션 중 가장 이른 것. 같은 폴더를 먼저 고른다.
   * 사용자가 직접 연 대화형 세션(codex-tui)은 고르지 않는다.
   * 호출이 이미 끝났다면(end) 그 전에 시작한 세션만 본다. 바로 실패한 호출이 다음 호출의 세션을 가져가지 않게.
   */
  link(toolUseId, ts, cwd, end) {
    const known = this.links.get(toolUseId);
    if (known) return this.byId.get(known);
    const candidates = [...this.byId.values()].filter((s) => !this.linked.has(s.id) && s.originator !== "codex-tui").filter((s) => s.start >= ts - LINK_BEFORE_MS && s.start <= Math.min(ts + LINK_AFTER_MS, end ?? Infinity)).sort((a, b) => Number(b.cwd === cwd) - Number(a.cwd === cwd) || a.start - b.start);
    const hit = candidates[0];
    if (!hit) return void 0;
    this.links.set(toolUseId, hit.id);
    this.linked.add(hit.id);
    return hit;
  }
  /** 최근 며칠치 날짜 폴더만 본다. 오래 열린 세션도 시작한 날짜 폴더에 계속 쓰므로 하루치로는 모자라다. */
  dayDirs() {
    const out = [];
    const desc = (d) => {
      try {
        return fs3.readdirSync(d).filter((n) => /^\d+$/.test(n)).sort().reverse();
      } catch {
        return [];
      }
    };
    for (const y of desc(CODEX_SESSIONS_DIR)) {
      for (const m of desc(path2.join(CODEX_SESSIONS_DIR, y))) {
        for (const d of desc(path2.join(CODEX_SESSIONS_DIR, y, m))) {
          out.push(path2.join(CODEX_SESSIONS_DIR, y, m, d));
          if (out.length >= CODEX_DAY_DIRS) return out;
        }
      }
    }
    return out;
  }
  read(file, st) {
    const cached = this.byFile.get(file);
    if (cached && cached.mtime === st.mtimeMs) return cached;
    let id = cached?.id ?? "";
    let cwd = cached?.cwd ?? "";
    let start = cached?.start ?? 0;
    let originator = cached?.originator ?? "";
    if (!cwd) {
      const top = readSlice(file, 0, Math.min(st.size, 64 * 1024)).toString("utf8");
      const nl = top.indexOf("\n");
      try {
        const meta = JSON.parse(nl < 0 ? top : top.slice(0, nl));
        if (meta?.type === "session_meta") {
          id = String(meta.payload?.id ?? "");
          cwd = String(meta.payload?.cwd ?? "");
          start = Date.parse(meta.payload?.timestamp ?? meta.timestamp) || 0;
          originator = String(meta.payload?.originator ?? "");
        }
      } catch {
      }
    }
    if (!id) id = /([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/i.exec(file)?.[1] ?? "";
    if (!id || !cwd) return null;
    let title = cached?.title ?? "";
    const tail = readSlice(file, Math.max(0, st.size - 256 * 1024), st.size).toString("utf8");
    for (const l of tail.split("\n").reverse()) {
      if (!/"role":\s*"user"/.test(l)) continue;
      const ev = parseCodexLine(l).find((e) => e.k === "prompt");
      if (ev && ev.k === "prompt") {
        title = ev.text;
        break;
      }
    }
    const s = { id, file, cwd, title, mtime: st.mtimeMs, size: st.size, start: start || st.birthtimeMs, originator };
    this.byFile.set(file, s);
    return s;
  }
  scan(now) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const dir of this.dayDirs()) {
      let names;
      try {
        names = fs3.readdirSync(dir).filter((n) => n.startsWith("rollout-") && n.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const n of names) {
        const file = path2.join(dir, n);
        const st = statOrNull(file);
        if (!st || !st.size || now - st.mtimeMs >= RECENT_MS) continue;
        const s = this.read(file, st);
        if (!s) continue;
        seen.add(file);
        out.push(s);
      }
    }
    for (const f of this.byFile.keys()) if (!seen.has(f)) this.byFile.delete(f);
    this.byId = new Map(out.map((s) => [s.id, s]));
    for (const [toolUseId, h] of [...this.pending].sort((a, b) => a[1].ts - b[1].ts)) {
      if (this.link(toolUseId, h.ts, h.cwd, h.end) || h.end !== void 0 || now - h.ts > LINK_AFTER_MS) {
        this.pending.delete(toolUseId);
      }
    }
    return out;
  }
};
var codexIndex = new CodexIndex();
function sessionFile(dir, id) {
  return codexIndex.get(id)?.file ?? path2.join(PROJECTS_DIR, dir, `${id}.jsonl`);
}
var FloorScanner = class {
  constructor(onChange) {
    this.onChange = onChange;
  }
  onChange;
  heads = /* @__PURE__ */ new Map();
  git = new GitPoller(() => this.scan());
  floors = [];
  timer;
  lastJson = "";
  start() {
    this.scan();
    this.timer = setInterval(() => this.scan(), SCAN_MS);
  }
  stop() {
    clearInterval(this.timer);
  }
  /**
   * from 바이트부터 끝까지 codex 호출과 그 결과를 찾아 codexIndex에 올린다. 다 읽은 줄 끝을 돌려준다.
   * 꼬리만 보면 서버를 다시 띄웠을 때 이미 지나간 호출을 놓쳐 Codex 매장이 따로 튀어나온다.
   */
  scanHandoffs(file, from, size, cwd) {
    let at = from;
    let skip = false;
    while (at < size) {
      const buf = readSlice(file, at, Math.min(size, at + HANDOFF_CHUNK));
      const cut = buf.lastIndexOf(10);
      if (cut < 0) {
        if (buf.length < HANDOFF_CHUNK) break;
        at += buf.length;
        skip = true;
        continue;
      }
      const begin = skip ? buf.indexOf(10) + 1 : 0;
      skip = false;
      for (const l of buf.subarray(begin, cut).toString("utf8").split("\n")) {
        const use = l.includes('"tool_use"') && l.includes("codex");
        const result = !use && l.includes('"tool_result"') && codexIndex.isPending(TOOL_RESULT_ID_RE.exec(l)?.[1] ?? "");
        if (!use && !result) continue;
        for (const e of parseLine(l)) {
          if (e.k === "spawn" && e.subagentType === "Codex") codexIndex.addHandoff(e.toolUseId, e.ts, cwd);
          else if (e.k === "toolDone" && !e.async) codexIndex.handoffDone(e.id, e.ts);
        }
      }
      at += cut + 1;
    }
    return at;
  }
  head(file, st, now) {
    const cached = this.heads.get(file);
    if (cached && cached.mtime === st.mtimeMs) return cached;
    const tail = readSlice(file, Math.max(0, st.size - 256 * 1024), st.size).toString("utf8");
    let title = lastMatch(tail, /"type":"ai-title","aiTitle":"((?:[^"\\]|\\.)*)"/g) ?? lastMatch(tail, /"type":"last-prompt","lastPrompt":"((?:[^"\\]|\\.)*)"/g) ?? cached?.title ?? "";
    let cwd = cached?.cwd ?? "";
    if (!cwd) {
      const top = readSlice(file, 0, Math.min(st.size, 128 * 1024)).toString("utf8");
      cwd = lastMatch(top, /"cwd":"((?:[^"\\]|\\.)*)"/g) ?? lastMatch(tail, /"cwd":"((?:[^"\\]|\\.)*)"/g) ?? "";
    }
    cwd = unescapeJson(cwd);
    let from = cached && cached.scanned <= st.size ? cached.scanned : now - st.mtimeMs < RECENT_MS ? 0 : st.size;
    from = this.scanHandoffs(file, from, st.size, cwd);
    const h = { mtime: st.mtimeMs, title: redact(unescapeJson(title)), cwd, scanned: from };
    this.heads.set(file, h);
    return h;
  }
  /** Codex 세션을 같은 작업 폴더의 층에 얹는다. 그런 층이 없으면 새 층을 만든다. */
  mergeCodex(floors, now) {
    for (const cx of codexIndex.scan(now)) {
      if (codexIndex.isLinked(cx.id)) continue;
      const dir = encodeCwd(cx.cwd);
      let f = floors.find((x) => x.dir === dir);
      if (!f) {
        const git2 = this.git.get(cx.cwd);
        f = { dir, name: path2.basename(cx.cwd) || cx.cwd, cwd: cx.cwd, mtime: 0, sessions: [], ...git2 ? { git: git2 } : {} };
        floors.push(f);
      }
      f.sessions.push({ id: cx.id, title: cx.title, mtime: cx.mtime, size: cx.size, source: "codex" });
      f.sessions.sort((a, b) => b.mtime - a.mtime);
      f.mtime = Math.max(f.mtime, cx.mtime);
    }
  }
  scan() {
    let dirs;
    try {
      dirs = fs3.readdirSync(PROJECTS_DIR);
    } catch {
      dirs = [];
    }
    const now = Date.now();
    const floors = [];
    for (const dir of dirs) {
      const full = path2.join(PROJECTS_DIR, dir);
      let names;
      try {
        names = fs3.readdirSync(full).filter((n) => n.endsWith(".jsonl"));
      } catch {
        continue;
      }
      const all = [];
      for (const n of names) {
        const file = path2.join(full, n);
        const st = statOrNull(file);
        if (!st || !st.size) continue;
        const h = this.head(file, st, now);
        all.push({ id: n.slice(0, -6), title: h.title, mtime: st.mtimeMs, size: st.size, cwd: h.cwd });
      }
      if (!all.length) continue;
      all.sort((a, b) => b.mtime - a.mtime);
      const recent = all.filter((s) => now - s.mtime < RECENT_MS);
      const sessions = (recent.length ? recent : all.slice(0, 3)).map(({ cwd: _cwd, ...s }) => s);
      const cwd = all.find((s) => s.cwd)?.cwd ?? "";
      const git2 = this.git.get(cwd);
      floors.push({
        dir,
        name: cwd ? path2.basename(cwd) || cwd : dir,
        cwd,
        mtime: all[0].mtime,
        sessions,
        ...git2 ? { git: git2 } : {}
      });
    }
    this.mergeCodex(floors, now);
    this.git.refresh(floors.map((f) => ({ cwd: f.cwd, live: now - f.mtime < LIVE_MS })));
    this.floors = floors;
    const json = JSON.stringify(floors);
    if (json !== this.lastJson) {
      this.lastJson = json;
      this.onChange(floors);
    }
  }
};
var SessionTail = class {
  constructor(key, onEvents) {
    this.key = key;
    this.onEvents = onEvents;
    const [dir, id] = key.split("/");
    const cx = codexIndex.get(id);
    this.source = cx ? "codex" : "claude";
    this.mainFile = cx ? cx.file : path2.join(PROJECTS_DIR, dir, `${id}.jsonl`);
    this.subDir = cx ? "" : path2.join(PROJECTS_DIR, dir, id, "subagents");
    this.parse = cx ? parseCodexLine : parseLine;
  }
  key;
  onEvents;
  files = /* @__PURE__ */ new Map();
  pendingSince = /* @__PURE__ */ new Map();
  timer;
  mainFile;
  subDir;
  source;
  parse;
  // Claude가 codex exec로 맡긴 일: 아직 기록을 못 찾은 호출(toolUseId → 시작·끝)과 찾은 기록(파일 → toolUseId)
  handoffs = /* @__PURE__ */ new Map();
  codexFiles = /* @__PURE__ */ new Map();
  cwd = "";
  static valid(key) {
    const parts = key.split("/");
    return parts.length === 2 && parts.every((p) => p && !p.includes("..") && !/[\\:]/.test(p));
  }
  /** 줄 하나를 이벤트로. 어느 파서를 쓸지 고르고, cwd와 Codex 호출을 기억해 둔다. */
  parseFrom(file, line, agent) {
    if (this.codexFiles.has(file)) return parseCodexLine(line, agent);
    if (!this.cwd && this.source === "claude" && line.includes('"cwd"')) {
      try {
        this.cwd = String(JSON.parse(line).cwd ?? "");
      } catch {
      }
    }
    const events = this.parse(line, agent);
    for (const e of events) {
      if (e.k === "spawn" && e.subagentType === "Codex") this.handoffs.set(e.toolUseId, { ts: e.ts });
      else if (e.k === "toolDone" && !e.async) {
        const h = this.handoffs.get(e.id);
        if (h) h.end = e.ts;
      }
    }
    return events;
  }
  /** 아직 못 찾은 Codex 호출의 기록을 찾아 붙인다 */
  linkCodex() {
    for (const [toolUseId, h] of this.handoffs) {
      const cx = codexIndex.link(toolUseId, h.ts, this.cwd, h.end);
      if (cx) this.codexFiles.set(cx.file, toolUseId);
      if (cx || h.end !== void 0) this.handoffs.delete(toolUseId);
    }
  }
  /** 지금까지의 기록을 이벤트로 돌려주고, 이후 증가분을 따라가기 시작한다. */
  replay() {
    const events = [];
    const read = (file, agent) => {
      const st = statOrNull(file);
      if (!st) return;
      const start = Math.max(0, st.size - REPLAY_BYTES);
      const buf = readSlice(file, start, st.size);
      const cut = buf.lastIndexOf(10);
      const lines = cut < 0 ? [] : buf.subarray(0, cut).toString("utf8").split("\n");
      if (start > 0) lines.shift();
      for (const l of lines) if (l.trim()) events.push(...this.parseFrom(file, l, agent));
      this.files.set(file, { offset: st.size, rest: Buffer.from(buf.subarray(cut + 1)), agent });
    };
    for (const [file, agent] of this.discover(true)) read(file, agent);
    this.linkCodex();
    for (const [file, agent] of this.codexFiles) if (!this.files.has(file)) read(file, agent);
    events.sort((a, b) => a.ts - b.ts);
    return events.slice(-REPLAY_MAX_EVENTS);
  }
  start() {
    this.timer = setInterval(() => this.poll(), TAIL_MS);
  }
  stop() {
    clearInterval(this.timer);
  }
  /** [파일, 에이전트 키] 목록. 서브에이전트 키는 meta.json의 toolUseId. */
  discover(initial) {
    const out = [[this.mainFile, "main"]];
    if (!initial) {
      this.linkCodex();
      out.push(...this.codexFiles);
    }
    if (!this.subDir) return out;
    let names = [];
    try {
      names = fs3.readdirSync(this.subDir).filter((n) => n.endsWith(".jsonl"));
    } catch {
      return out;
    }
    for (const n of names) {
      const file = path2.join(this.subDir, n);
      const known = this.files.get(file);
      if (known) {
        out.push([file, known.agent]);
        continue;
      }
      const agentId = n.replace(/^agent-/, "").replace(/\.jsonl$/, "");
      let agent;
      try {
        const meta = JSON.parse(fs3.readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8"));
        if (meta?.toolUseId) agent = String(meta.toolUseId);
      } catch {
      }
      if (!agent) {
        const first = this.pendingSince.get(file) ?? Date.now();
        this.pendingSince.set(file, first);
        if (!initial && Date.now() - first < META_WAIT_MS) continue;
        agent = `agent:${agentId}`;
      }
      out.push([file, agent]);
    }
    return out;
  }
  poll() {
    const events = [];
    for (const [file, agent] of this.discover(false)) {
      const st = statOrNull(file);
      if (!st) continue;
      let f = this.files.get(file);
      if (!f) {
        f = { offset: 0, rest: Buffer.alloc(0), agent };
        this.files.set(file, f);
      }
      if (st.size < f.offset) {
        f.offset = 0;
        f.rest = Buffer.alloc(0);
      }
      if (st.size === f.offset) continue;
      const chunk = Buffer.concat([f.rest, readSlice(file, f.offset, st.size)]);
      f.offset = st.size;
      const cut = chunk.lastIndexOf(10);
      if (cut < 0) {
        f.rest = chunk;
        continue;
      }
      f.rest = chunk.subarray(cut + 1);
      for (const l of chunk.subarray(0, cut).toString("utf8").split("\n")) {
        if (l.trim()) events.push(...this.parseFrom(file, l, f.agent));
      }
    }
    if (events.length) {
      events.sort((a, b) => a.ts - b.ts);
      this.onEvents(events);
    }
  }
};

// server/bridge.ts
var OfficeHub = class {
  /** @param allowedHosts IP와 localhost 말고도 받아 줄 Host 이름 (server/host.ts) */
  constructor(allowedHosts = []) {
    this.allowedHosts = allowedHosts;
  }
  allowedHosts;
  clients = /* @__PURE__ */ new Set();
  tails = /* @__PURE__ */ new Map();
  scanner = new FloorScanner((floors) => this.broadcast({ t: "floors", floors }));
  tracker = new CollisionTracker(sessionFile);
  collisions = [];
  collisionsJson = "[]";
  timers = [];
  start() {
    this.scanner.start();
    this.timers = [
      // 창에서 벗어난 충돌도 사라져야 하므로 파일 변화와 상관없이 매초 다시 계산한다
      setInterval(() => this.checkCollisions(), 1e3).unref(),
      // 프록시가 연결을 끊지 않게 주기적으로 주석을 흘린다
      setInterval(() => {
        for (const c of this.clients) c.res.write(": ping\n\n");
      }, 15e3).unref()
    ];
  }
  stop() {
    this.scanner.stop();
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const tail of this.tails.values()) tail.stop();
    this.tails.clear();
  }
  /** 지금 스트림을 열어 둔 페이지 수. 아무도 없으면 서버가 스스로 끝낼 수 있다. */
  get clientCount() {
    return this.clients.size;
  }
  checkCollisions() {
    const list = this.tracker.update(this.scanner.floors);
    const json = JSON.stringify(list);
    if (json === this.collisionsJson) return;
    this.collisionsJson = json;
    this.collisions = list;
    this.broadcast({ t: "collisions", list });
  }
  send(c, msg) {
    c.res.write(`data: ${JSON.stringify(msg)}

`);
  }
  broadcast(msg) {
    for (const c of this.clients) this.send(c, msg);
  }
  /** /api/stream?session=<dir>/<id> 처리. 처리했으면 true. */
  handle(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/stream") return false;
    if (!isLocalHost(req.headers.host, this.allowedHosts)) {
      res.writeHead(403).end(FORBIDDEN_HOST);
      return true;
    }
    const session = url.searchParams.get("session") ?? void 0;
    if (session && !SessionTail.valid(session)) {
      res.writeHead(400).end("bad session");
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const client = { res, session };
    this.clients.add(client);
    this.send(client, { t: "floors", floors: this.scanner.floors });
    this.send(client, { t: "collisions", list: this.collisions });
    if (session) {
      const live = this.tails.get(session);
      const tail = live ?? new SessionTail(session, (events2) => this.toSession(session, events2));
      const events = live ? new SessionTail(session, () => {
      }).replay() : tail.replay();
      this.send(client, { t: "replay", session, events, source: tail.source });
      if (!live) {
        this.tails.set(session, tail);
        tail.start();
      }
    }
    req.on("close", () => {
      this.clients.delete(client);
      if (session && ![...this.clients].some((c) => c.session === session)) {
        this.tails.get(session)?.stop();
        this.tails.delete(session);
      }
    });
    return true;
  }
  toSession(session, events) {
    for (const c of this.clients) if (c.session === session) this.send(c, { t: "events", session, events });
  }
};

// package.json
var package_default = {
  name: "panoptes-office",
  version: "0.2.0",
  description: "An isometric office that moves along with your Claude Code sessions.",
  keywords: [
    "claude-code",
    "codex",
    "visualization",
    "sessions",
    "subagents",
    "dashboard"
  ],
  license: "MIT",
  author: "smyeong123",
  homepage: "https://github.com/smyeong123/panoptes#readme",
  repository: {
    type: "git",
    url: "git+https://github.com/smyeong123/panoptes.git"
  },
  bugs: {
    url: "https://github.com/smyeong123/panoptes/issues"
  },
  type: "module",
  engines: {
    node: ">=20"
  },
  bin: {
    panoptes: "plugin/dist/panoptes.mjs"
  },
  files: [
    "plugin/dist"
  ],
  scripts: {
    dev: "vite",
    build: "tsc --noEmit && vite build",
    "build:plugin": "node scripts/build-plugin.mjs",
    start: "tsx server/index.ts",
    test: "vitest run",
    typecheck: "tsc --noEmit",
    prepublishOnly: "npm test"
  },
  devDependencies: {
    "@types/node": "^22.10.0",
    esbuild: "^0.28.2",
    tsx: "^4.19.2",
    typescript: "^5.7.2",
    vite: "^6.0.3",
    vitest: "^2.1.8"
  }
};

// server/version.ts
var VERSION = package_default.version;

// server/app.ts
var IDLE_CHECK_MS = 3e4;
var TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png"
};
function resolveStatic(webDir, urlPath) {
  const root = path3.resolve(webDir);
  const file = path3.join(root, urlPath === "/" ? "index.html" : urlPath);
  return file === root || file.startsWith(root + path3.sep) ? file : null;
}
function startServer(opts) {
  const root = path3.resolve(opts.webDir);
  const allowedHosts = [opts.host];
  const hub = new OfficeHub(allowedHosts);
  hub.start();
  const respond = (req, res) => {
    if (hub.handle(req, res)) return;
    if (!isLocalHost(req.headers.host, allowedHosts)) {
      res.writeHead(403).end(FORBIDDEN_HOST);
      return;
    }
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === "/api/health") {
      const health = { app: "panoptes", version: VERSION, pid: process.pid };
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(health));
      return;
    }
    let file = resolveStatic(root, decodeURIComponent(pathname));
    if (!file || !fs4.existsSync(file) || fs4.statSync(file).isDirectory()) {
      file = path3.join(root, "index.html");
    }
    if (!fs4.existsSync(file)) {
      res.writeHead(500).end("dist\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 npm run build \uB97C \uC2E4\uD589\uD558\uC138\uC694.");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path3.extname(file)] ?? "application/octet-stream" });
    fs4.createReadStream(file).pipe(res);
  };
  const server = http.createServer((req, res) => {
    try {
      respond(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end("bad request");
    }
  });
  let idleTimer;
  if (opts.idleExitMs) {
    const idleMs = opts.idleExitMs;
    const onIdle = opts.onIdle ?? (() => process.exit(0));
    let since = Date.now();
    idleTimer = setInterval(
      () => {
        if (hub.clientCount > 0) since = Date.now();
        else if (Date.now() - since >= idleMs) {
          clearInterval(idleTimer);
          onIdle();
        }
      },
      Math.min(idleMs, IDLE_CHECK_MS)
    );
  }
  const stop2 = () => {
    clearInterval(idleTimer);
    hub.stop();
  };
  return new Promise((resolve, reject) => {
    const failed = (err) => {
      stop2();
      reject(err);
    };
    server.once("error", failed);
    server.listen(opts.port, opts.host, () => {
      server.off("error", failed);
      resolve({
        port: server.address().port,
        close: () => new Promise((done) => {
          stop2();
          server.close(() => done());
          server.closeAllConnections();
        })
      });
    });
  });
}

// server/cli.ts
var SELF = fileURLToPath(import.meta.url);
var WEB_DIR = path4.join(path4.dirname(SELF), "web");
var HOST = process.env.PANOPTES_HOST || "127.0.0.1";
var PORT = Number(process.env.PANOPTES_PORT || 4317);
var VISIT_HOST = HOST === "0.0.0.0" || HOST === "::" ? "127.0.0.1" : HOST;
var BASE = `http://${VISIT_HOST.includes(":") ? `[${VISIT_HOST}]` : VISIT_HOST}:${PORT}`;
var PROBE_TIMEOUT_MS = 1e3;
var START_WAIT_MS = 5e3;
var STOP_WAIT_MS = 3e3;
var DEFAULT_IDLE_MINUTES = 30;
function isHealth(value) {
  const h = value;
  return h?.app === "panoptes" && typeof h.version === "string" && Number.isInteger(h.pid) && h.pid > 0;
}
async function probe() {
  let res;
  try {
    res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  } catch (err) {
    const code = err.cause?.code;
    return code === "ECONNREFUSED" ? { state: "free" } : { state: "other" };
  }
  const body = await res.json().catch(() => null);
  return isHealth(body) ? { state: "panoptes", health: body } : { state: "other" };
}
async function waitUntil(want, ms) {
  const until = Date.now() + ms;
  for (; ; ) {
    const now = await probe();
    if (now.state === want || Date.now() >= until) return now;
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function stopServer(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
  }
  return (await waitUntil("free", STOP_WAIT_MS)).state === "free";
}
function openBrowser(url) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true });
  child.on("error", () => {
  });
  child.unref();
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
async function open(launchBrowser) {
  let now = await probe();
  if (now.state === "panoptes" && now.health.version !== VERSION) {
    if (!await stopServer(now.health.pid)) {
      fail(`Could not stop Panoptes ${now.health.version} at ${BASE} to replace it with ${VERSION}.`);
    }
    now = { state: "free" };
  }
  if (now.state === "other") {
    fail(`Something other than Panoptes is answering at ${BASE}. Set PANOPTES_PORT to a free port and try again.`);
  }
  if (now.state === "free") {
    const child = spawn(process.execPath, [...process.execArgv, SELF, "serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    now = await waitUntil("panoptes", START_WAIT_MS);
    if (now.state !== "panoptes") {
      fail(`Panoptes did not start within ${START_WAIT_MS / 1e3} seconds. Run "node ${SELF} serve" to see why.`);
    }
  }
  if (launchBrowser) openBrowser(BASE);
  console.log(`Panoptes is running at ${BASE}`);
}
async function serve() {
  const raw = Number(process.env.PANOPTES_IDLE_MINUTES ?? DEFAULT_IDLE_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_IDLE_MINUTES;
  await startServer({
    host: HOST,
    port: PORT,
    webDir: WEB_DIR,
    idleExitMs: minutes > 0 ? minutes * 6e4 : void 0
  });
  console.log(`\u{1F441}\uFE0F Panoptes ${VERSION} \u2192 ${BASE}`);
}
async function stop() {
  const now = await probe();
  if (now.state !== "panoptes") {
    console.log(`Panoptes is not running at ${BASE}.`);
    return;
  }
  if (!await stopServer(now.health.pid)) fail(`Panoptes at ${BASE} did not stop.`);
  console.log("Panoptes stopped.");
}
async function status() {
  const now = await probe();
  console.log(
    now.state === "panoptes" ? `Panoptes ${now.health.version} is running at ${BASE}` : `Panoptes is not running at ${BASE}.`
  );
}
var USAGE = "Usage: panoptes [open [--no-open] | serve | stop | status | --version]";
var [command = "open", ...flags] = process.argv.slice(2);
switch (command) {
  case "--version":
  case "-v":
    console.log(VERSION);
    break;
  case "--help":
  case "-h":
    console.log(USAGE);
    break;
  case "open":
    await open(!flags.includes("--no-open"));
    break;
  case "serve":
    await serve();
    break;
  case "stop":
    await stop();
    break;
  case "status":
    await status();
    break;
  default:
    fail(USAGE);
}
