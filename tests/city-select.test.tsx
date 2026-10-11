import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CITIES, type CityId } from '@/lib/geo';
import { ko } from '@/lib/i18n/ko';
import { en } from '@/lib/i18n/en';
import { CityMenuContent, citySubLabel } from '@/components/CitySelect';

// The closed popover renders no list on the server, so the exported list body is rendered directly.
const render = (current: CityId) => renderToStaticMarkup(<CityMenuContent current={current} onPick={() => {}} />);

const currentIs = (id: CityId) => new RegExp(`data-city="${id}"[^>]*aria-current="true"|aria-current="true"[^>]*data-city="${id}"`);

describe('CityMenuContent', () => {
  it('lists every city of every country, not just the selected country', () => {
    const html = render('brooklyn');
    for (const c of CITIES) expect(html).toContain(`data-city="${c.id}"`);
    for (const c of CITIES) expect(html).toContain(ko.city[c.id]);
    for (const country of ['us', 'jp', 'tw'] as const) expect(html).toContain(ko.country[country]);
  });

  it('labels each coming-soon city and gives live cities a store count', () => {
    const html = render('brooklyn');
    const soon = CITIES.filter((c) => c.status === 'soon').length;
    expect(html.split(ko.citySelect.soon).length - 1).toBeGreaterThanOrEqual(soon);
    expect(html).toMatch(/매장 \d+곳/);
  });

  it('marks exactly the current city', () => {
    const html = render('nj');
    expect(html.match(/aria-current="true"/g)?.length).toBe(1);
    expect(html).toMatch(currentIs('nj'));
  });

  it('marks a coming-soon city as current when it is the one shown', () => {
    expect(render('tokyo')).toMatch(currentIs('tokyo'));
  });
});

describe('citySubLabel', () => {
  const city = (id: CityId) => CITIES.find((c) => c.id === id)!;

  it('keeps a region that adds information', () => {
    expect(citySubLabel(city('brooklyn'), ko)).toBe('New York');
    expect(citySubLabel(city('la'), en)).toBe('California');
    expect(citySubLabel(city('nj'), ko)).toBe('New Jersey');
  });

  it('hides a sub-name that only repeats the country, in both locales', () => {
    for (const d of [ko, en]) {
      for (const id of ['tokyo', 'osaka', 'sapporo', 'taipei'] as const) expect(citySubLabel(city(id), d)).toBeNull();
    }
  });

  it('hides a sub-name equal to the displayed city name', () => {
    expect(citySubLabel(city('nj'), en)).toBeNull();
  });

  it('leaves no country echo in the rendered menu', () => {
    const html = render('tokyo');
    expect(html).not.toContain('>Japan<');
    expect(html).not.toContain('>Taiwan<');
    expect(html).toContain('>New York<');
  });
});
