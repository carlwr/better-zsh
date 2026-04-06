Third-party material in this directory
=====================================

The `.yo` files in this directory are copied from the zsh source repository.
They are vendored verbatim; local adjustments belong in the parse/render
pipeline, not in these source files.

Upstream provenance
-------------------

- Project: zsh
- Canonical repository:
  https://sourceforge.net/p/zsh/code/ci/master/tree/Doc/Zsh/
- Mirror:
  https://github.com/zsh-users/zsh/tree/master/Doc/Zsh/
- Vendored tag: `zsh-5.9`
- Vendored commit: `73d317384c9225e46d66444f93b46f0fbe7084ef`
- Vendored date: `2022-05-14`

How this repository uses it
---------------------------

- `zsh-core` ships these vendored `.yo` files in published artifacts.
- `zsh-core` also ships generated JSON derived from these files.
- `better-zsh` ships the vendored `.yo` files as runtime data used by the
  extension.

Re-vendoring reminder
---------------------

When updating the vendored zsh docs, keep `SOURCE.md` and this file in sync and
re-check the upstream `LICENCE` note about GPL-licensed shell functions. These
vendored Yodl docs are expected to stay on the permissive zsh license path, but
that should be confirmed when the source set changes.

Upstream zsh license
--------------------

Unless otherwise noted in the header of specific files, files in this
distribution have the licence shown below.

However, note that certain shell functions are licensed under versions
of the GNU General Public Licence. Anyone distributing the shell as a
binary including those files needs to take account of this. Search
shell functions for "Copyright" for specific copyright information.
None of the core functions are affected by this, so those files may
simply be omitted.

--

The Z Shell is copyright (c) 1992-2017 Paul Falstad, Richard Coleman,
Zoltan Hidvegi, Andrew Main, Peter Stephenson, Sven Wischnowsky, and
others. All rights reserved. Individual authors, whether or not
specifically named, retain copyright in all changes; in what follows, they
are referred to as `the Zsh Development Group'. This is for convenience
only and this body has no legal status. The Z shell is distributed under
the following licence; any provisions made in individual files take
precedence.

Permission is hereby granted, without written agreement and without
licence or royalty fees, to use, copy, modify, and distribute this
software and to distribute modified versions of this software for any
purpose, provided that the above copyright notice and the following
two paragraphs appear in all copies of this software.

In no event shall the Zsh Development Group be liable to any party for
direct, indirect, special, incidental, or consequential damages arising out
of the use of this software and its documentation, even if the Zsh
Development Group have been advised of the possibility of such damage.

The Zsh Development Group specifically disclaim any warranties, including,
but not limited to, the implied warranties of merchantability and fitness
for a particular purpose. The software provided hereunder is on an "as is"
basis, and the Zsh Development Group have no obligation to provide
maintenance, support, updates, enhancements, or modifications.
