import { type IQuotaRegistry, type IQuotaProvider } from "./interfaces";

const REGISTRY_KEY = "__OPENCODE_QUOTA_REGISTRY__";

type RegistryGlobal = {
  [REGISTRY_KEY]?: IQuotaRegistry;
};

function createRegistry(): IQuotaRegistry {
  const providers: IQuotaProvider[] = [];
  return {
    register(provider: IQuotaProvider) {
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

export function getQuotaRegistry(): IQuotaRegistry {
  const globalRef = globalThis as RegistryGlobal;
  if (!globalRef[REGISTRY_KEY]) {
    globalRef[REGISTRY_KEY] = createRegistry();
  }
  return globalRef[REGISTRY_KEY] as IQuotaRegistry;
}
