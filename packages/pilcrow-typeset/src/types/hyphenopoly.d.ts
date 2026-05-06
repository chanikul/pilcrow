declare module 'hyphenopoly' {
  interface HyphenopolyConfig {
    require: string[];
    hyphen?: string;
    minWordLength?: number;
    leftmin?: number;
    rightmin?: number;
    compound?: 'auto' | 'hyphen' | 'all';
    loader?: (file: string, patDir: URL) => Promise<Buffer | Uint8Array>;
  }

  type HyphenateFn = (text: string) => string;

  const hyphenopoly: {
    config(opts: HyphenopolyConfig): Map<string, Promise<HyphenateFn>>;
  };

  export default hyphenopoly;
}
