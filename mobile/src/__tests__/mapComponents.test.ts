import fs from 'fs';
import path from 'path';

describe('map component exports', () => {
  it('barrel exports DriverMarker for public tracking screen', () => {
    const indexPath = path.join(__dirname, '../components/map/index.ts');
    const source = fs.readFileSync(indexPath, 'utf8');
    expect(source).toContain("export { DriverMarker } from './DriverMarker'");
    expect(source).toContain("export { MapRecenterFab } from './MapRecenterFab'");
    expect(source).toContain("export { RoutePin } from './RoutePin'");
  });
});
