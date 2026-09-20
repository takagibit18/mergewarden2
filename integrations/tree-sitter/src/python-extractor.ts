import { createHash } from "node:crypto";
import { Language, Parser } from "web-tree-sitter";
import type { LanguageExtractor, SyntaxFacts, SymbolFact } from "../../../src/graph/contracts.ts";
import { loadPinnedPythonGrammar } from "./pinned-grammar.ts";
interface SyntaxNode {
  type: string; text: string; hasError: boolean;
  startPosition: { row: number; column: number }; endPosition: { row: number; column: number };
  namedChildren: SyntaxNode[]; childForFieldName(name: string): SyntaxNode | null;
}
const idFor = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
/** Genuine CST traversal -> normalized syntax facts. No imports are executed.
 * NOT a complete Python semantic resolver: every call target remains unresolved.
 * Decorator/default-argument scopes, aliasing and class binding need follow-up.
 */
export class PythonTreeSitterExtractor implements LanguageExtractor {
  language = "python";
  private parser: Parser;
  private constructor(parser: Parser) { this.parser = parser; }
  static async create(vettedGrammarWasmPath?: string): Promise<PythonTreeSitterExtractor> {
    const grammar = await loadPinnedPythonGrammar(vettedGrammarWasmPath);
    await Parser.init();
    const language = await Language.load(grammar.bytes);
    if (language.abiVersion !== grammar.abi) throw new Error("Python grammar ABI does not match the checked-in lock");
    const parser = new Parser(); parser.setLanguage(language);
    return new PythonTreeSitterExtractor(parser);
  }
  async extract(input: { snapshotId: string; path: string; source: string }): Promise<SyntaxFacts> {
    const tree = this.parser.parse(input.source);
    if (!tree) throw new Error("Tree-sitter did not return a tree");
    const facts: SyntaxFacts = { symbols: [], calls: [], parseComplete: !tree.rootNode.hasError, diagnostics: [] };
    try {
      const walk = (node: SyntaxNode, scope: SymbolFact | undefined, names: string[]) => {
        let current = scope; let qualified = names;
        if (node.type === "function_definition" || node.type === "class_definition") {
          const name = node.childForFieldName("name")?.text;
          if (name) {
            qualified = [...names, name];
            const symbol: SymbolFact = { id: idFor([input.snapshotId, input.path, qualified, node.startPosition]),
              snapshotId: input.snapshotId, path: input.path, qualifiedName: qualified.join("."),
              kind: node.type === "class_definition" ? "class" : "function",
              startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1,
              ...(scope ? { parentSymbolId: scope.id } : {}) };
            facts.symbols.push(symbol); current = symbol;
          }
        }
        if (node.type === "call") {
          const expression = node.childForFieldName("function")?.text ?? "<unknown>";
          facts.calls.push({ id: idFor([input.snapshotId, input.path, "call", node.startPosition]),
            snapshotId: input.snapshotId, path: input.path, expression, startLine: node.startPosition.row + 1,
            ...(scope ? { ownerSymbolId: scope.id } : {}), resolution: "unresolved", candidateTargetIds: [] });
        }
        for (const child of node.namedChildren) walk(child, current, qualified);
      };
      walk(tree.rootNode as unknown as SyntaxNode, undefined, []);
      if (!facts.parseComplete) facts.diagnostics.push("Syntax errors exist; these facts do not cover a complete parse.");
      facts.diagnostics.push("Syntax facts only: no scoped/import resolution or repository call graph yet.");
      return facts;
    } finally { tree.delete(); }
  }
  dispose(): void { this.parser.delete(); }
}
