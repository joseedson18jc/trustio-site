import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workerPath = resolve(root, "dist/server/index.js");
const manifestPath = resolve(root, "dist/.openai/hosting.json");

await access(workerPath);
const hosting = JSON.parse(await readFile(manifestPath, "utf8"));
if (!hosting.project_id) throw new Error("Hosting manifest is missing project_id.");

const worker = (await import(`${workerPath}?validation=${Date.now()}`)).default;
if (!worker || typeof worker.fetch !== "function") throw new Error("Worker must export a callable fetch function.");

for (const [path, expectedStatus, expectedType] of [
  ["/", 200, "text/html"],
  ["/manifesto.html", 200, "text/html"],
  ["/assets/styles.css", 200, "text/css"],
  ["/assets/app.js", 200, "text/javascript"],
  ["/missing-page", 404, "text/html"],
]) {
  const response = await worker.fetch(new Request(`https://trustio.example${path}`));
  if (response.status !== expectedStatus) throw new Error(`${path} returned ${response.status}.`);
  if (!response.headers.get("content-type")?.startsWith(expectedType)) {
    throw new Error(`${path} returned the wrong content type.`);
  }
}

console.log("Trustio production artifact is valid.");
