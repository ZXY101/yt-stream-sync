import { execFileSync } from "node:child_process";

// Every run tests a fresh build, never a stale dist/.
export default function globalSetup() {
  execFileSync("npx", ["vite", "build", "--logLevel", "warn"], { stdio: "inherit" });
}
