import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

/**
 * Native React Native hosts reject even whitespace JSXText children.
 * Web and react-test-renderer don't always catch this: a stray sequence
 * `>              {expression}` crashed the actual 390dp Android catalog.
 */
it('contains no inline raw JSX text children outside Text in the Customer catalog', () => {
  const fs = jest.requireActual('fs') as { readFileSync: (path: string, encoding: string) => string };
  const source = fs.readFileSync('src/screens/customer/CustomerServicesScreen.tsx', 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const offenders: string[] = [];

  traverse(ast, {
    JSXElement({ node }) {
      const tag = node.openingElement.name;
      if (tag.type !== 'JSXIdentifier' || tag.name === 'Text') return;
      for (const child of node.children) {
        if (child.type === 'JSXText' && child.value.length > 0
          && !/[\r\n]/.test(child.value)) {
          offenders.push(`${tag.name}:${child.loc?.start.line ?? '?'}`);
        }
      }
    },
  });

  expect(offenders).toEqual([]);
});
