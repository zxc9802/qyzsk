import { register } from "node:module";

register(new URL("./resolve-alias-loader.mjs", import.meta.url));
