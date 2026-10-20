import { homeCategories } from './home-categories';
import { getServicePresentation } from '../../constants/service-presentation';

const category = (code: string, name: string, sortOrder: number, isActive = true) => ({ id: `id-${code}`, code, name, sortOrder, isActive });

describe('Home categories', () => {
  it('keeps the active ones in the server order, trimmed', () => {
    const list = [category('CAT_PIPE', ' Đường ống nước ', 9), category('CAT_AC', 'Điều hòa', 1), category('CAT_OLD', 'Cũ', 2, false), category('CAT_X', '  ', 3)];
    expect(homeCategories(list).map((c) => [c.code, c.name])).toEqual([['CAT_AC', 'Điều hòa'], ['CAT_PIPE', 'Đường ống nước']]);
    expect(homeCategories(null)).toEqual([]);
  });

  it('picks the artwork of a representative service for each live category', () => {
    const live = ['CAT_AC', 'CAT_LAUNDRY', 'CAT_FRIDGE', 'CAT_RO', 'CAT_HEATER', 'CAT_KITCHEN', 'CAT_ELECTRIC', 'CAT_LIGHT_FAN',
      'CAT_PIPE', 'CAT_PUMP', 'CAT_SANITARY', 'CAT_TV', 'CAT_LOCK'].map((code, i) => category(code, code, i));
    for (const tile of homeCategories(live)) {
      expect({ code: tile.code, art: getServicePresentation(tile.artCode)?.assetFileName }).toEqual({ code: tile.code, art: expect.stringMatching(/\.png$/) });
    }
  });

  it('lets an unknown new category through with the neutral picture', () => {
    expect(homeCategories([category('CAT_NEW', 'Mới', 1)])[0].artCode).toBe('CAT_NEW');
    expect(getServicePresentation('CAT_NEW')).toBeNull();
  });
});
