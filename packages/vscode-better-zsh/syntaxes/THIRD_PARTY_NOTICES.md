Third-party material in this directory
=====================================

This package vendors `shell-unix-bash.tmLanguage.json`, copied from the VS Code
shellscript extension and modified locally only to use the zsh scope name.

Upstream provenance
-------------------

- Project: Visual Studio Code
- Source file:
  https://github.com/microsoft/vscode/blob/main/extensions/shellscript/syntaxes/shell-unix-bash.tmLanguage.json
- Update script in this repo:
  `packages/vscode-better-zsh/scripts/update-grammar`
- Local modification after copy:
  `scopeName = "source.shell.zsh"`

Courtesy attribution
--------------------

The vendored grammar file itself records that the upstream VS Code file was
converted from `jeff-hykin/better-shell-syntax` and asks that improvements be
sent there first. This repository keeps that provenance note intact inside the
JSON file.

Upstream VS Code license
------------------------

MIT License

Copyright (c) 2015 - present Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
