import { execSync } from "node:child_process";

// Every run tests a fresh build, never a stale dist/.
// Through the shell because npm is `npm.cmd` on Windows, which can't be spawned without one.
// The command is a fixed string, so nothing untrusted reaches the shell.
export default function globalSetup() {
  execSync("npm run --silent build", { stdio: "inherit" });
}
