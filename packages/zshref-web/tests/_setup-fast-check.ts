// Pinned fast-check seed, the same as the zsh-core and tooldef test setups
// (TESTING.md: a fixed checked-in seed), so property tests replay identically
// run to run. Not a test file: `_`-prefixed and outside the test glob.

import fc from 'fast-check';

const FC_SEED = 16042026;

fc.configureGlobal({ seed: FC_SEED });
