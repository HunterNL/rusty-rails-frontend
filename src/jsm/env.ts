

declare var DEFINE_PRODUCTION: boolean; // set by Esbuild

export function isProduction(): boolean {
    return DEFINE_PRODUCTION;
}
