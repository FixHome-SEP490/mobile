import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import PillText from './PillText';
import StatusBadge from './StatusBadge';
import { appSources } from '../test-utils/source-files';

async function render(node: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(node); });
  return tree;
}

describe('PillText (M-7, M-16, M-21)', () => {
  it('lays a pill label out on one line, so Android cannot move its last word to a hidden second line', async () => {
    const tree = await render(<PillText style={{ fontWeight: '600' }}>Đã duyệt</PillText>);
    const text = tree.root.findByType(Text);
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.children).toBe('Đã duyệt');
    expect(text.props.style).toEqual({ fontWeight: '600' });
    await act(async () => tree.unmount());
  });

  it('lets a caller that needs wrapping ask for it', async () => {
    const tree = await render(<PillText numberOfLines={2}>Đã hủy</PillText>);
    expect(tree.root.findByType(Text).props.numberOfLines).toBe(2);
    await act(async () => tree.unmount());
  });

  it('status badges use it, so "Đã duyệt" and "Đã hủy" keep their second word', async () => {
    const tree = await render(<StatusBadge view={{ label: 'Đã duyệt', tone: 'success', icon: 'CheckCircle2' }} />);
    const label = tree.root.findAllByType(Text).find(node => node.props.children === 'Đã duyệt');
    expect(label?.props.numberOfLines).toBe(1);
    await act(async () => tree.unmount());
  });

  it('pill, badge, chip and tag labels across the app use it instead of a plain Text', () => {
    // Buttons, free-text suggestion chips and the order stage chips may need two lines and stay plain Text.
    const pillStyle = /styles\.(?![A-Za-z]*(?:Btn|quickChip|suggestionChip|inlineTag|stageChip))[A-Za-z]*(?:[bB]adge|[pP]ill|[cC]hip|[tT]ag)[A-Za-z]*\b|styles\.(?:statusText|orderStatusText|usageStatusText|countText)\b/;
    const offenders = appSources().flatMap(([file, source]) =>
      [...source.matchAll(/<Text((?:\s[^<>]*?)?)>([^<]*?)<\/Text>/g)]
        .filter(([, attrs]) => pillStyle.test(attrs) && !/numberOfLines/.test(attrs))
        .map(([whole]) => `${file}: ${whole.slice(0, 80)}`));
    expect(offenders).toEqual([]);
  });
});
