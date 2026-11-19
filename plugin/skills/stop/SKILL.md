---
name: stop
description: Stop the Panoptes server that /panoptes:open started.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/panoptes.mjs" *)
---

Run this command once with the Bash tool, exactly as written:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/panoptes.mjs" stop
```

Then tell the user what it printed, in one line, and stop.

Don't run any other command, and don't read or change any files.
