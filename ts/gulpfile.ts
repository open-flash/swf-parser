import gulp from "gulp";
import minimist from "minimist";
import * as buildTools from "turbo-gulp";
import { Project } from "turbo-gulp/project";
import { LibTarget, registerLibTasks } from "turbo-gulp/targets/lib";
import { MochaTarget, registerMochaTasks } from "turbo-gulp/targets/mocha";
import { NodeTarget, registerNodeTasks } from "turbo-gulp/targets/node";

interface Options {
  next?: string;
}

const options: Options & minimist.ParsedArgs = minimist(process.argv.slice(2), {
  string: ["next"],
  default: {next: undefined},
});

const project: Project = {
  root: __dirname,
  packageJson: "package.json",
  buildDir: "build",
  distDir: "dist",
  srcDir: "src",
  tslint: {
    configuration: {
      rules: {
        "whitespace": false,
      },
    },
  },
};

const lib: LibTarget = {
  project,
  name: "lib",
  srcDir: "src/lib",
  scripts: ["**/*.ts"],
  mainModule: "index",
  dist: {
    packageJsonMap: (old: buildTools.PackageJson): buildTools.PackageJson => {
      const version: string = options.next !== undefined ? `${old.version}-build.${options.next}` : old.version;
      return <any> {...old, version, scripts: undefined, private: false};
    },
    npmPublish: {
      tag: options.next !== undefined ? "next" : "latest",
    },
  },
  tscOptions: {
    declaration: true,
    skipLibCheck: true,
  },
  typedoc: {
    dir: "typedoc",
    name: "SWF Parser",
    deploy: {
      repository: "git@github.com:open-flash/swf-parser.git",
      branch: "gh-pages",
    },
  },
  clean: {
    dirs: ["build/lib", "dist/lib"],
  },
};

const test: MochaTarget = {
  project,
  name: "test",
  srcDir: "src",
  scripts: ["test/**/*.ts", "lib/**/*.ts"],
  tscOptions: {
    skipLibCheck: true,
  },
  clean: {
    dirs: ["build/test"],
  },
};

const main: NodeTarget = {
  project,
  name: "main",
  srcDir: "src",
  scripts: ["main/**/*.ts", "lib/**/*.ts"],
  tsconfigJson: "src/main/tsconfig.json",
  mainModule: "main/main",
  tscOptions: {
    skipLibCheck: true,
  },
  clean: {
    dirs: ["build/main", "dist/main"],
  },
};

const libTasks: any = registerLibTasks(gulp, lib);
registerMochaTasks(gulp, test);
registerNodeTasks(gulp, main);
buildTools.projectTasks.registerAll(gulp, project);

gulp.task("all:tsconfig.json", gulp.parallel("lib:tsconfig.json", "main:tsconfig.json", "test:tsconfig.json"));
gulp.task("dist", libTasks.dist);
gulp.task("default", libTasks.dist);
