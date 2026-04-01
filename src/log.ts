import * as vscode from "vscode";

let ch: vscode.LogOutputChannel | undefined;

export function initLog() {
	ch = vscode.window.createOutputChannel("Better Zsh", { log: true });
	return ch;
}

export function log(msg: string) {
	ch?.info(msg);
}

export function warn(msg: string) {
	ch?.warn(msg);
}
