import * as fs from "fs";
import * as sysPath from "path";

export const testResourcesRoot: string = __dirname;

export function readTestResource(path: string): Buffer {
  return fs.readFileSync(sysPath.resolve(__dirname, path));
}

export function readTestJson(path: string): any {
  return JSON.parse(readTestResource(path).toString("utf8"));
}
