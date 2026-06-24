declare module "mammoth/mammoth.browser" {
  interface ExtractResult {
    value: string;
    messages: unknown[];
  }
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractResult>;
  };
  export default mammoth;
}
