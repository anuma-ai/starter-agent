# Setup

The starter agent stores its configuration in `~/.anuma/config.json`. The config module reads and writes this file and provides helpers used by every command.

## Configuration

{@includeCode ../src/config.ts#config}

`getApiKey` exits the process if no key is found, so commands that need authentication fail early with a helpful message. `getApiUrl` falls back to the default Portal URL when no override is configured.

## Authentication

To get an API key, sign in at [dashboard.anuma.ai](https://dashboard.anuma.ai/) and create an app. This provisions the API account that powers AI responses.

The `login` command saves an API key to the config file:

{@includeCode ../src/commands/login.ts#login}

Run it once to authenticate:

```bash
anuma-agent login --api-key <your-key>
```

## Entry Point

The CLI entry point wires up the commands with [Commander](https://github.com/tj/commander.js):

{@includeCode ../src/index.ts#entrypoint}
