import { execFileSync } from "node:child_process";

// Every run tests a fresh build, never a stale dist/.
export default function globalSetup() {
  execFileSync("npm", ["run", "--silent", "build"], { stdio: "inherit" });
}
