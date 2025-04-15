declare module "typesense" {
  // Using namespace instead of static class to avoid linter issues
  namespace Typesense {
    class Client {
      constructor(options: {
        apiKey: string;
        nodes: Array<{
          host: string;
          port: number;
          protocol: string;
        }>;
        connectionTimeoutSeconds?: number;
      });

      collections(collectionName?: string): {
        retrieve(): Promise<Record<string, unknown>>;
        documents(): {
          search(
            parameters: Record<string, unknown>
          ): Promise<Record<string, unknown>>;
        };
      };
    }
  }

  // Default export
  const Typesense: {
    Client: typeof Typesense.Client;
  };

  export default Typesense;
}
