---
name: open
description: Start Panoptes if it isn't running yet and open the isometric office in the browser.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/panoptes.mjs" *)
---

Run this command once with the Bash tool, exactly as written:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/panoptes.mjs" open
```

Then answer in one or two lines and stop:

- If it prints `Panoptes is running at <url>`, give the user that URL. The command has already tried to open it in their browser.
- If it prints anything else, show that message as it is.
- If `node` isn't found, say that Panoptes needs Node.js 20 or later on the PATH.

Don't run any other command, and don't read or change any files.
