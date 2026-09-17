// Stands in for the `vscode` module under vitest (`vitest.config.ts` alias):
// plain data classes, enums with distinct values, and recording versions of
// the registration/event APIs. `SemanticTokensBuilder.build()` returns the raw
// pushes (not the delta-encoded array), which is what tests want to read.

export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

export class Range {
  start: Position
  end: Position
  constructor(sl: number, sc: number, el: number, ec: number) {
    this.start = new Position(sl, sc)
    this.end = new Position(el, ec)
  }
}

export class MarkdownString {
  constructor(public value = "") {}
  appendCodeblock(s: string, lang = "") {
    this.value += `\n\`\`\`${lang}\n${s}\n\`\`\`\n`
    return this
  }
  appendMarkdown(s: string) {
    this.value += s
    return this
  }
}

export class Hover {
  constructor(
    public contents: MarkdownString,
    public range?: Range,
  ) {}
}

export const CompletionItemKind = {
  Text: 0,
  Keyword: 1,
  Variable: 2,
  Property: 3,
  Operator: 4,
  Function: 5,
} as const

export class CompletionItem {
  detail?: string
  documentation?: MarkdownString
  filterText?: string
  constructor(
    public label: string,
    public kind: number,
  ) {}
}

export class CompletionList {
  constructor(
    public items: CompletionItem[],
    public isIncomplete: boolean,
  ) {}
}

export class SemanticTokensLegend {
  constructor(
    public tokenTypes: string[],
    public tokenModifiers: string[],
  ) {}
}

export interface RawToken {
  line: number
  start: number
  length: number
  type: number
  modifiers: number
}

export class SemanticTokensBuilder {
  private tokens: RawToken[] = []
  push(
    line: number,
    start: number,
    length: number,
    type: number,
    modifiers: number,
  ) {
    this.tokens.push({ line, start, length, type, modifiers })
  }
  build() {
    return { data: this.tokens }
  }
}

export class Location {
  constructor(
    public uri: unknown,
    public range: Range,
  ) {}
}

export class DocumentHighlight {
  constructor(public range: Range) {}
}

export const SymbolKind = { Function: 11 } as const

export class DocumentSymbol {
  constructor(
    public name: string,
    public detail: string,
    public kind: number,
    public range: Range,
    public selectionRange: Range,
  ) {}
}

export class SymbolInformation {
  constructor(
    public name: string,
    public kind: number,
    public containerName: string,
    public location: Location,
  ) {}
}

export class WorkspaceEdit {
  edits: { uri: unknown; range: Range; newText: string }[] = []
  replace(uri: unknown, range: Range, newText: string) {
    this.edits.push({ uri, range, newText })
  }
}

export class DocumentLink {
  constructor(
    public range: Range,
    public target: unknown,
  ) {}
}

export const Uri = {
  file: (fsPath: string) => ({
    scheme: "file",
    fsPath,
    toString: () => `file://${fsPath}`,
  }),
}

export const DiagnosticSeverity = { Error: 0, Warning: 1 } as const

export class Diagnostic {
  source?: string
  constructor(
    public range: Range,
    public message: string,
    public severity: number,
  ) {}
}

export class Disposable {
  constructor(public dispose: () => void) {}
  static from(...ds: { dispose(): void }[]) {
    return new Disposable(() => {
      for (const d of ds) d.dispose()
    })
  }
}

// ── Recording APIs; `stub` is the test-side handle ──

type Listener = (e: unknown) => void

const listeners = new Map<string, Set<Listener>>()

function event(name: string) {
  return (listener: Listener) => {
    const set = listeners.get(name) ?? new Set()
    listeners.set(name, set)
    set.add(listener)
    return new Disposable(() => set.delete(listener))
  }
}

export const stub = {
  config: new Map<string, unknown>(),
  /** Values passed to the `setContext` command. */
  contextKeys: new Map<string, unknown>(),
  registrations: [] as string[],
  fire(name: string, e: unknown) {
    for (const l of listeners.get(name) ?? []) l(e)
  },
  openDocs(...docs: unknown[]) {
    workspace.textDocuments.push(...docs)
  },
  reset() {
    listeners.clear()
    stub.config.clear()
    stub.contextKeys.clear()
    stub.registrations.length = 0
    workspace.textDocuments.length = 0
    workspace.isTrusted = true
    window.visibleTextEditors.length = 0
  },
}

const recording =
  (name: string) =>
  (..._args: unknown[]) => {
    stub.registrations.push(name)
    return new Disposable(() => {})
  }

export const workspace = {
  textDocuments: [] as unknown[],
  isTrusted: true,
  getConfiguration: (section?: string) => ({
    get: <T>(key: string, dflt?: T): T | undefined =>
      (stub.config.get(section ? `${section}.${key}` : key) as T | undefined) ??
      dflt,
  }),
  onDidOpenTextDocument: event("open"),
  onDidSaveTextDocument: event("save"),
  onDidChangeTextDocument: event("change"),
  onDidCloseTextDocument: event("close"),
  onDidChangeConfiguration: event("config"),
  onDidGrantWorkspaceTrust: event("trust"),
}

export class DiagnosticCollection {
  byUri = new Map<string, Diagnostic[]>()
  set(uri: { toString(): string }, diags: Diagnostic[]) {
    this.byUri.set(uri.toString(), diags)
  }
  delete(uri: { toString(): string }) {
    this.byUri.delete(uri.toString())
  }
  clear() {
    this.byUri.clear()
  }
  dispose() {}
}

export const languages = {
  /** The most recently created collection. */
  last: undefined as DiagnosticCollection | undefined,
  createDiagnosticCollection(_name: string) {
    languages.last = new DiagnosticCollection()
    return languages.last
  },
  registerHoverProvider: recording("hover"),
  registerCompletionItemProvider: recording("completion"),
  registerDocumentSemanticTokensProvider: recording("semanticTokens"),
  registerDefinitionProvider: recording("definition"),
  registerReferenceProvider: recording("reference"),
  registerRenameProvider: recording("rename"),
  registerDocumentHighlightProvider: recording("highlight"),
  registerDocumentSymbolProvider: recording("documentSymbol"),
  registerWorkspaceSymbolProvider: recording("workspaceSymbol"),
  registerDocumentLinkProvider: recording("documentLink"),
}

export const commands = {
  registerCommand: recording("command"),
  executeCommand: (command: string, ...args: unknown[]) => {
    if (command === "setContext") stub.contextKeys.set(String(args[0]), args[1])
    return Promise.resolve()
  },
}

export const window = {
  visibleTextEditors: [] as { document: { languageId: string } }[],
  onDidChangeVisibleTextEditors: event("visibleEditors"),
  createOutputChannel: () => ({
    info() {},
    warn() {},
    dispose() {},
  }),
}
