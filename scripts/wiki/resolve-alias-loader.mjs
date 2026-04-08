import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();

function resolveAliasPath(specifier) {
  const basePath = path.join(PROJECT_ROOT, specifier.slice(2));
  return resolveCandidatePath(basePath);
}

function resolveCandidatePath(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
    path.join(basePath, "index.mjs"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolvedPath = resolveAliasPath(specifier);
    if (!resolvedPath) {
      throw new Error(`Unable to resolve alias import: ${specifier}`);
    }

    return {
      shortCircuit: true,
      url: pathToFileURL(resolvedPath).href,
    };
  }

  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !path.extname(specifier)) {
    const parentPath = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : PROJECT_ROOT;
    const resolvedPath = resolveCandidatePath(path.resolve(parentPath, specifier));
    if (resolvedPath) {
      return {
        shortCircuit: true,
        url: pathToFileURL(resolvedPath).href,
      };
    }
  }

  return nextResolve(specifier, context);
}
