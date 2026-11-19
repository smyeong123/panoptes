---
name: open
description: Start Panoptes if it isn't running yet and open the isometric office in the browser.
disable-model-invocation: true
---

Run this command once with the Bash tool, exactly as written:

```bash
panoptes open
```

Then answer in one or two lines and stop:

- If it prints `Panoptes is running at <url>`, give the user that URL. The command has already tried to open it in their browser.
- If the shell says the `panoptes` command isn't found, tell the user that this plugin needs the Panoptes command installed first, and give them this link: https://github.com/smyeong123/panoptes#install-the-command. Don't try to install it yourself.
- If it prints anything else, show that message as it is.

Don't run any other command, and don't read or change any files.
