

declare var DEFINE_CLIENT_DEBUG: boolean; // set by Esbuild

export function isDebugEnabled(): boolean {
    return DEFINE_CLIENT_DEBUG;
}
