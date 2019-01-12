import fs from "fs";
import sysPath from "path";
import meta from "./meta.js";

export const testResourcesRoot: string = meta.dirname;

export function readTestResource(path: string): Buffer {
  return fs.readFileSync(sysPath.resolve(testResourcesRoot, path));
}

export function readTestJson(path: string): any {
  return JSON.parse(readTestResource(path).toString("utf8"));
}
