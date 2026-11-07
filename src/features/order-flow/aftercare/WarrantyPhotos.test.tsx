import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { WarrantyPhotos } from './WarrantyPhotos';

const byLabel = (renderer: ReturnType<typeof create>, label: string) => renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const render = async (props: Partial<React.ComponentProps<typeof WarrantyPhotos>> = {}) => {
  const onChange = jest.fn(), onUploaded = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<WarrantyPhotos urls={[]} onChange={onChange} onUploaded={onUploaded} {...props} />); });
  return { renderer, onChange, onUploaded };
};

it('adds an uploaded photo and tells the controller about it', async () => {
  const pick = jest.fn().mockResolvedValue('https://cdn.test/a.jpg');
  const { renderer, onChange, onUploaded } = await render({ pick });

  await act(async () => { await byLabel(renderer, 'Chọn ảnh từ thư viện').props.onPress(); });

  expect(pick).toHaveBeenCalledWith('library');
  expect(onUploaded).toHaveBeenCalledWith(['https://cdn.test/a.jpg']);
  expect(onChange).toHaveBeenCalledWith(['https://cdn.test/a.jpg']);
});

it('keeps the list and shows the reason when the picker refuses or the upload fails; a cancelled pick changes nothing', async () => {
  const failing = await render({ pick: jest.fn().mockRejectedValue(new Error('Ảnh lớn hơn 10 MB, vui lòng chọn ảnh nhỏ hơn.')) });
  await act(async () => { await byLabel(failing.renderer, 'Chụp ảnh').props.onPress(); });
  expect(failing.renderer.root.findAllByType(Text).some(text => String(text.props.children).includes('lớn hơn 10 MB'))).toBe(true);
  expect(failing.onChange).not.toHaveBeenCalled();

  const cancelled = await render({ pick: jest.fn().mockResolvedValue(null) });
  await act(async () => { await byLabel(cancelled.renderer, 'Chụp ảnh').props.onPress(); });
  expect(cancelled.onChange).not.toHaveBeenCalled();
});

it('removes a photo and stops at five', async () => {
  const urls = ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg', 'https://cdn.test/3.jpg', 'https://cdn.test/4.jpg', 'https://cdn.test/5.jpg'];
  const pick = jest.fn();
  const { renderer, onChange, onUploaded } = await render({ urls, pick });

  await act(async () => { await byLabel(renderer, 'Chụp ảnh').props.onPress(); });
  expect(pick).not.toHaveBeenCalled();

  act(() => byLabel(renderer, 'Bỏ ảnh 2').props.onPress());
  expect(onChange).toHaveBeenCalledWith(urls.filter((_, index) => index !== 1));
  expect(onUploaded).toHaveBeenCalledWith(urls.filter((_, index) => index !== 1));
});
