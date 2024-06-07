import esbuild from "esbuild";
import fs from "node:fs";

const defines = {};
defines.DEFINE_PRODUCTION = "true"
defines.DEFINE_API_HOST = `"${process.env.APP_API_HOST}"` || `"https://api.dev.localhost/"`
defines.DEFINE_CLIENT_DEBUG = "false"

let result = await esbuild.build({
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    treeShaking: true,
    metafile: true,
    outfile: "public/generated/app.js",
    define: defines,
    entryPoints: ["./src/app.ts"]
})

result.errors.forEach(error => {
    console.log(error);
})

if (result.errors.length > 0) {
    process.exit(1);
}


fs.writeFileSync("./meta.json", JSON.stringify(result.metafile));

