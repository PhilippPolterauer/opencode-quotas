const REGISTRY_KEY = "__OPENCODE_QUOTA_REGISTRY__";
function createRegistry() {
    const providers = [];
    return {
        register(provider) {
            if (providers.some((p) => p.id === provider.id)) {
                return;
            }
            providers.push(provider);
        },
        getAll() {
            return [...providers];
        },
    };
}
export function getQuotaRegistry() {
    const globalRef = globalThis;
    if (!globalRef[REGISTRY_KEY]) {
        globalRef[REGISTRY_KEY] = createRegistry();
    }
    return globalRef[REGISTRY_KEY];
}
