import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedPath } from '../lib/security';
const id = '86d076a7-7827-4013-a6f9-a32f94e0131b';
test('service routes pass through gateways only with exact methods and UUID scope', () => {
  const routes: [string, string][] = [
    ['GET', `directory/branches/${id}/services`],
    ['GET', `gyms/${id}/branches/${id}/services`],
    ['POST', `gyms/${id}/branches/${id}/services`],
    ['POST', `gyms/${id}/branches/${id}/services/${id}/price-requests`],
    ['PATCH', `gyms/${id}/branches/${id}/services/${id}/availability`],
    ['PATCH', `gyms/${id}/branches/${id}/services/booking-hours`],
    ['GET', 'admin/service-price-requests'],
    ['POST', `admin/service-price-requests/${id}/review`],
  ];
  for (const [method, path] of routes) {
    assert.equal(allowedPath(method, path), true, `${method} ${path}`);
    assert.equal(allowedPath('DELETE', path), false);
    assert.equal(allowedPath(method, path + '/extra'), false);
    if (path.includes(id)) assert.equal(allowedPath(method, path.replace(id, 'bad-id')), false);
  }
});
