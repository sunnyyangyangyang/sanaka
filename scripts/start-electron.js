#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");

const electronBinary = require("electron");
const projectRoot = path.resolve(__dirname, "..");

const args = ["."];

if (process.platform === "linux") {
  args.unshift("--no-sandbox");
}

const child = spawn(electronBinary, args, {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
