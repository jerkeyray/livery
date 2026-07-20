#!/usr/bin/env node

import { runCli } from "@liveryscript/cli";

process.exitCode = await runCli(process.argv.slice(2));
